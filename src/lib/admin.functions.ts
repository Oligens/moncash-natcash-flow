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
  .inputValidator((input) => z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { getSessionUser } = await import("./auth.server");
    const expectedEmail = (process.env["ADMIN_EMAIL"] ?? "").trim().toLowerCase();
    const expectedPassword = process.env["ADMIN_PASSWORD"] ?? process.env["ZAKA_ADMIN_PASSWORD"];
    if (!expectedEmail || !expectedPassword) throw new Error("Accès administrateur non configuré");

    const { createHash, timingSafeEqual } = await import("node:crypto");
    const a = createHash("sha256").update(data.password, "utf8").digest();
    const b = createHash("sha256").update(expectedPassword, "utf8").digest();
    if (data.email.toLowerCase() !== expectedEmail || !timingSafeEqual(a, b)) return { ok: false as const };

    const user = await getSessionUser();
    if (!user?.isAdmin || user.email.toLowerCase() !== expectedEmail) return { ok: false as const };
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
           ,(SELECT coalesce(sum(amount), 0) FROM platform_invoices WHERE status = 'paid')::float8 AS "invoiceRevenue"
  `) as { apps: number; activeSubs: number; volume: number; pendingInvoices: number; invoiceRevenue: number }[];

  const users = (await sql`SELECT id, email FROM users ORDER BY created_at ASC`) as {
    id: string;
    email: string;
  }[];

  return {
    developers,
    invoices,
    totals: totals[0] ?? { apps: 0, activeSubs: 0, volume: 0, pendingInvoices: 0, invoiceRevenue: 0 },
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
    const invoices = (await sql`
      SELECT developer_id, amount, period FROM platform_invoices WHERE id = ${data.invoiceId} LIMIT 1
    `) as { developer_id: string; amount: string; period: string }[];
    await sql`UPDATE platform_invoices SET status = ${data.status}, updated_at = now() WHERE id = ${data.invoiceId}`;
    if (data.status === "paid" && invoices[0]) {
      const invoice = invoices[0];
      const expires = invoice.period === "yearly"
        ? new Date(Date.now() + 365 * 86400000).toISOString()
        : new Date(Date.now() + 30 * 86400000).toISOString();
      await sql`
        UPDATE developer_subscriptions SET status = 'expired'
        WHERE developer_id = ${invoice.developer_id} AND status IN ('active', 'trialing')
      `;
      await sql`
        INSERT INTO developer_subscriptions (developer_id, plan, status, amount, currency, expires_at)
        VALUES (${invoice.developer_id}, ${invoice.period}, 'active', ${invoice.amount}, 'HTG', ${expires})
      `;
    }
    return { ok: true };
  });

export const listDeveloperSubscriptions = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("./db.server");
  const { requireAdmin } = await import("./auth.server");
  await requireAdmin();
  const sql = db();
  return (await sql`
    SELECT ds.id, ds.developer_id, u.email, ds.plan, ds.status, ds.amount, ds.currency,
           ds.starts_at, ds.expires_at, ds.promo_code_id
    FROM developer_subscriptions ds JOIN users u ON u.id = ds.developer_id
    ORDER BY ds.expires_at DESC NULLS FIRST, ds.created_at DESC
  `) as {
    id: string;
    developer_id: string;
    email: string;
    plan: string;
    status: string;
    amount: string;
    currency: string;
    starts_at: string;
    expires_at: string | null;
    promo_code_id: string | null;
  }[];
});

export const setDeveloperAccess = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ subscriptionId: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireAdmin } = await import("./auth.server");
    await requireAdmin();
    const sql = db();
    await sql`
      UPDATE developer_subscriptions
      SET status = ${data.active ? "active" : "cancelled"}
      WHERE id = ${data.subscriptionId}
    `;
    return { ok: true };
  });

const developerSubscriptionSchema = z.object({
  developerId: z.string().uuid(),
  plan: z.enum(["monthly", "yearly", "lifetime", "trial_days"]),
  amount: z.number().min(0).max(10000000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  trialDays: z.number().int().min(1).max(3650).optional(),
  promoCodeId: z.string().uuid().optional(),
});

export const activateDeveloperSubscription = createServerFn({ method: "POST" })
  .inputValidator((input) => developerSubscriptionSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireAdmin } = await import("./auth.server");
    await requireAdmin();
    const sql = db();
    const expires = data.plan === "lifetime"
      ? null
      : data.plan === "yearly"
        ? new Date(Date.now() + 365 * 86400000).toISOString()
        : data.plan === "trial_days"
          ? new Date(Date.now() + (data.trialDays ?? 15) * 86400000).toISOString()
          : new Date(Date.now() + 30 * 86400000).toISOString();
    await sql`
      UPDATE developer_subscriptions SET status = 'expired'
      WHERE developer_id = ${data.developerId} AND status IN ('active', 'trialing')
    `;
    await sql`
      INSERT INTO developer_subscriptions
        (developer_id, plan, status, amount, currency, expires_at, promo_code_id)
      VALUES (${data.developerId}, ${data.plan}, ${data.plan === "trial_days" ? "trialing" : "active"},
              ${data.amount}, ${data.currency}, ${expires}, ${data.promoCodeId ?? null})
    `;
    return { ok: true };
  });

export const listPromoCodes = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("./db.server");
  const { requireAdmin } = await import("./auth.server");
  await requireAdmin();
  const sql = db();
  return (await sql`
    SELECT id, code, duration_type, trial_days, max_redemptions, redemption_count, active, expires_at
    FROM promo_codes ORDER BY created_at DESC
  `) as {
    id: string;
    code: string;
    duration_type: string;
    trial_days: number | null;
    max_redemptions: number | null;
    redemption_count: number;
    active: boolean;
    expires_at: string | null;
  }[];
});

export const createPromoCode = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({
    code: z.string().trim().min(3).max(40).regex(/^[A-Z0-9_-]+$/),
    durationType: z.enum(["lifetime", "monthly", "yearly", "trial_days"]),
    trialDays: z.number().int().min(1).max(3650).optional(),
    maxRedemptions: z.number().int().positive().max(1000000).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireAdmin } = await import("./auth.server");
    await requireAdmin();
    const sql = db();
    await sql`
      INSERT INTO promo_codes (code, duration_type, trial_days, max_redemptions, expires_at)
      VALUES (${data.code}, ${data.durationType}, ${data.trialDays ?? null},
              ${data.maxRedemptions ?? null}, ${data.expiresAt ?? null})
    `;
    return { ok: true };
  });

export const setPromoCodeActive = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ promoCodeId: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireAdmin } = await import("./auth.server");
    await requireAdmin();
    const sql = db();
    await sql`UPDATE promo_codes SET active = ${data.active} WHERE id = ${data.promoCodeId}`;
    return { ok: true };
  });

export const setExchangeRate = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ currency: z.string().regex(/^[A-Z]{3}$/), rateToHtg: z.number().positive().max(1000000), effectiveOn: z.string().date().optional() }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireAdmin } = await import("./auth.server");
    await requireAdmin();
    const sql = db();
    await sql`
      INSERT INTO exchange_rates (currency, rate_to_htg, effective_on, source)
      VALUES (${data.currency}, ${data.rateToHtg}, ${data.effectiveOn ?? new Date().toISOString().slice(0, 10)}, 'admin')
      ON CONFLICT (currency, effective_on) DO UPDATE SET rate_to_htg = EXCLUDED.rate_to_htg, source = 'admin'
    `;
    return { ok: true };
  });

export const redeemPromoCode = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ code: z.string().trim().toUpperCase().min(3).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();
    const codes = (await sql`
      UPDATE promo_codes
      SET redemption_count = redemption_count + 1
      WHERE code = ${data.code} AND active = true
        AND (expires_at IS NULL OR expires_at > now())
        AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
      RETURNING id, duration_type, trial_days
    `) as { id: string; duration_type: string; trial_days: number | null }[];
    const promo = codes[0];
    if (!promo) throw new Error("Code promo invalide, expiré ou déjà épuisé");
    const expires = promo.duration_type === "lifetime"
      ? null
      : promo.duration_type === "yearly"
        ? new Date(Date.now() + 365 * 86400000).toISOString()
        : promo.duration_type === "monthly"
          ? new Date(Date.now() + 30 * 86400000).toISOString()
          : new Date(Date.now() + (promo.trial_days ?? 15) * 86400000).toISOString();
    await sql`
      UPDATE developer_subscriptions SET status = 'expired'
      WHERE developer_id = ${user.id} AND status IN ('active', 'trialing')
    `;
    await sql`
      INSERT INTO developer_subscriptions (developer_id, plan, status, amount, currency, expires_at, promo_code_id)
      VALUES (${user.id}, ${promo.duration_type}, ${promo.duration_type === "trial_days" ? "trialing" : "active"}, 0, 'HTG', ${expires}, ${promo.id})
    `;
    return { ok: true, expiresAt: expires };
  });
