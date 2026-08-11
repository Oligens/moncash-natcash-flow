import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Rôle du compte connecté. */
export const getMyRole = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("./auth.server");
  const user = await getSessionUser();
  return { isAdmin: Boolean(user?.isAdmin), userId: user?.id ?? null };
});

/** Déverrouillage secret de l'espace administrateur (mot de passe + rôle admin). */
export const unlockAdminAccess = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ password: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { getSessionUser } = await import("./auth.server");
    const expected = process.env["ZAKA_ADMIN_PASSWORD"];
    if (!expected) throw new Error("Accès administrateur non configuré");

    const { createHash, timingSafeEqual } = await import("node:crypto");
    const a = createHash("sha256").update(data.password, "utf8").digest();
    const b = createHash("sha256").update(expected, "utf8").digest();
    if (!timingSafeEqual(a, b)) return { ok: false as const };

    const user = await getSessionUser();
    if (!user?.isAdmin) return { ok: false as const };
    return { ok: true as const };
  });

export type PlatformSettings = {
  id: string;
  platform_name: string;
  saas_monthly_price: string;
  saas_yearly_price: string;
  trial_days: number;
  support_email: string;
  relay_apk_url: string;
};

/** Réglages non sensibles de la plateforme. */
export const getPlatformSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("./db.server");
  const { requireUser } = await import("./auth.server");
  await requireUser();
  const sql = db();
  const rows = (await sql`
    SELECT id, platform_name, saas_monthly_price, saas_yearly_price, trial_days, support_email, relay_apk_url
    FROM platform_settings LIMIT 1
  `) as PlatformSettings[];
  return rows[0] ?? null;
});

const settingsSchema = z.object({
  id: z.string().uuid(),
  platformName: z.string().trim().min(2).max(60),
  saasMonthlyPrice: z.number().min(0).max(1000000),
  saasYearlyPrice: z.number().min(0).max(10000000),
  trialDays: z.number().int().min(0).max(365),
  supportEmail: z.string().trim().email(),
  relayApkUrl: z.string().trim().max(500),
});

export const updatePlatformSettings = createServerFn({ method: "POST" })
  .inputValidator((input) => settingsSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireAdmin } = await import("./auth.server");
    await requireAdmin();
    const sql = db();
    await sql.query(
      `UPDATE platform_settings SET platform_name = $1, saas_monthly_price = $2, saas_yearly_price = $3,
         trial_days = $4, support_email = $5, relay_apk_url = $6, updated_at = now() WHERE id = $7`,
      [
        data.platformName,
        data.saasMonthlyPrice,
        data.saasYearlyPrice,
        data.trialDays,
        data.supportEmail,
        data.relayApkUrl,
        data.id,
      ],
    );
    return { ok: true };
  });

type InvoiceRow = {
  id: string;
  developer_id: string;
  developer_email: string | null;
  amount: string;
  period: string;
  status: string;
  due_date: string | null;
  created_at: string;
};

/** Vue globale : développeurs, applications, volume encaissé et factures SaaS. */
export const getAdminOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("./db.server");
  const { requireAdmin } = await import("./auth.server");
  await requireAdmin();
  const sql = db();

  const developers = (await sql`
    SELECT u.id AS "developerId", u.email,
           count(DISTINCT a.id)::int AS apps,
           count(s.id) FILTER (WHERE s.status = 'active')::int AS "activeSubs",
           coalesce(sum(s.amount) FILTER (WHERE s.status = 'active'), 0)::float8 AS revenue
    FROM users u
    LEFT JOIN apps a ON a.owner_id = u.id
    LEFT JOIN subscriptions s ON s.app_id = a.id
    GROUP BY u.id, u.email
    ORDER BY revenue DESC
  `) as { developerId: string; email: string; apps: number; activeSubs: number; revenue: number }[];

  const invoices = (await sql`
    SELECT id, developer_id, developer_email, amount, period, status, due_date, created_at
    FROM platform_invoices ORDER BY created_at DESC
  `) as InvoiceRow[];

  const totals = (await sql`
    SELECT (SELECT count(*) FROM apps)::int AS apps,
           (SELECT count(*) FROM subscriptions WHERE status = 'active')::int AS "activeSubs",
           (SELECT coalesce(sum(amount), 0) FROM subscriptions WHERE status = 'active')::float8 AS volume,
           (SELECT count(*) FROM platform_invoices WHERE status = 'pending')::int AS "pendingInvoices"
  `) as { apps: number; activeSubs: number; volume: number; pendingInvoices: number }[];

  const users = (await sql`SELECT id, email FROM users ORDER BY created_at ASC`) as {
    id: string;
    email: string;
  }[];

  return {
    developers,
    invoices,
    totals: totals[0] ?? { apps: 0, activeSubs: 0, volume: 0, pendingInvoices: 0 },
    users,
  };
});

export const createInvoice = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        developerId: z.string().uuid(),
        developerEmail: z.string().trim().max(200).optional(),
        amount: z.number().positive().max(10000000),
        period: z.enum(["monthly", "yearly"]),
        dueDate: z.string().trim().min(4).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireAdmin } = await import("./auth.server");
    await requireAdmin();
    const sql = db();
    await sql`
      INSERT INTO platform_invoices (developer_id, developer_email, amount, period, due_date, status)
      VALUES (${data.developerId}, ${data.developerEmail ?? null}, ${data.amount}, ${data.period}, ${data.dueDate}, 'pending')
    `;
    return { ok: true };
  });

export const setInvoiceStatus = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        status: z.enum(["pending", "paid", "cancelled"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireAdmin } = await import("./auth.server");
    await requireAdmin();
    const sql = db();
    await sql`UPDATE platform_invoices SET status = ${data.status}, updated_at = now() WHERE id = ${data.invoiceId}`;
    return { ok: true };
  });
