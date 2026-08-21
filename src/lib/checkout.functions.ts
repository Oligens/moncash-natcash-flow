import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const initSchema = z.object({
  appId: z.string().uuid(),
  userId: z.string().trim().min(1).max(80),
  accountName: z.string().trim().min(3, "Nom trop court").max(80),
  userPhone: z.string().trim().max(20).optional().or(z.literal("")),
  provider: z.enum(["moncash", "natcash"]),
  planId: z.string().uuid(),
});

/** Démo interne du tunnel de paiement (les apps tierces passent par /api/v1/checkout/init). */
export const initDemoCheckout = createServerFn({ method: "POST" })
  .inputValidator((input) => initSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const sql = db();
    const planRows = (await sql`
      SELECT p.id, p.plan_key, p.amount, p.currency, r.rate_to_htg
      FROM app_plans p
      LEFT JOIN LATERAL (
        SELECT rate_to_htg FROM exchange_rates
        WHERE currency = p.currency AND effective_on <= CURRENT_DATE
        ORDER BY effective_on DESC LIMIT 1
      ) r ON true
      WHERE p.id = ${data.planId} AND p.app_id = ${data.appId} AND p.active = true
      LIMIT 1
    `) as {
      id: string;
      plan_key: string;
      amount: string;
      currency: string;
      rate_to_htg: string | null;
    }[];
    const plan = planRows[0];
    if (!plan || !plan.rate_to_htg) throw new Error("Plan ou taux de change indisponible.");
    const sourceAmount = Number(plan.amount);
    const exchangeRate = Number(plan.rate_to_htg);
    const amount = Math.ceil(sourceAmount * exchangeRate);

    const rows = (await sql`
            INSERT INTO subscriptions (app_id, user_id, user_phone, account_name, provider, plan_type, amount,
               source_amount, source_currency, exchange_rate, plan_id, status)
      VALUES (${data.appId}, ${data.userId}, ${data.userPhone || null}, ${data.accountName},
              ${data.provider}, ${plan.plan_key}, ${amount}, ${sourceAmount}, ${plan.currency},
              ${exchangeRate}, ${plan.id}, 'pending')
      RETURNING id, amount, status
    `) as { id: string; amount: string; status: string }[];

    const row = rows[0]!;
    return { subscriptionId: row.id, amount: Number(row.amount), status: row.status };
  });

export const getCheckoutStatus = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ subscriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const sql = db();
    const rows = (await sql`
      SELECT status, expires_at FROM subscriptions WHERE id = ${data.subscriptionId} LIMIT 1
    `) as { status: string; expires_at: string | null }[];
    const row = rows[0];
    return { status: row?.status ?? "unknown", expiresAt: row?.expires_at ?? null };
  });

export type PublicApp = {
  id: string;
  name: string;
  moncash_number: string | null;
  natcash_number: string | null;
  qr_image_url: string | null;
  plans: PublicPlan[];
};

export type PublicPlan = {
  id: string;
  plan_key: string;
  name: string;
  amount: number;
  currency: string;
  period: string;
  description: string | null;
  rate_to_htg: number | null;
  amount_htg: number | null;
};

/** Résout une application à partir de sa clé API publique de redirection (page /pay). */
export const resolveAppByApiKey = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ apiKey: z.string().trim().min(10).max(120) }).parse(input))
  .handler(async ({ data }) => {
    const { requireActiveApiApp } = await import("./api-access");
    const access = await requireActiveApiApp(data.apiKey);
    if (!access.app) return null;
    const { db } = await import("./db.server");
    const sql = db();
    const apps = (await sql`
      SELECT id, name, moncash_number, natcash_number, qr_image_url
      FROM apps WHERE id = ${access.app.id} LIMIT 1
    `) as Omit<PublicApp, "plans">[];
    const app = apps[0];
    if (!app) return null;
    const plans = (await sql`
      SELECT p.id, p.plan_key, p.name, p.amount::float8, p.currency, p.period, p.description,
             r.rate_to_htg::float8,
             ceil(p.amount * r.rate_to_htg)::float8 AS amount_htg
      FROM app_plans p
      LEFT JOIN LATERAL (
        SELECT rate_to_htg FROM exchange_rates
        WHERE currency = p.currency AND effective_on <= CURRENT_DATE
        ORDER BY effective_on DESC LIMIT 1
      ) r ON true
      WHERE p.app_id = ${app.id} AND p.active = true ORDER BY p.created_at ASC
    `) as PublicPlan[];
    return { ...app, plans };
  });

/** Liste publique et minimale des applications connectées (démo du tunnel). */
export const listPublicApps = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("./db.server");
  const sql = db();
  return (await sql`
    SELECT id, name, slug FROM apps ORDER BY created_at ASC
  `) as { id: string; name: string; slug: string }[];
});

export const listPublicPlans = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ appId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const sql = db();
    return (await sql`
      SELECT p.id, p.plan_key, p.name, p.amount::float8, p.currency, p.period, p.description,
             r.rate_to_htg::float8,
             ceil(p.amount * r.rate_to_htg)::float8 AS amount_htg
      FROM app_plans p
      LEFT JOIN LATERAL (
        SELECT rate_to_htg FROM exchange_rates
        WHERE currency = p.currency AND effective_on <= CURRENT_DATE
        ORDER BY effective_on DESC LIMIT 1
      ) r ON true
      WHERE p.app_id = ${data.appId} AND p.active = true ORDER BY p.created_at ASC
    `) as PublicPlan[];
  });
