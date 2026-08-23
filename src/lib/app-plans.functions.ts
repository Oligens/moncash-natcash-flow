import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const appIdSchema = z.object({ appId: z.string().uuid() });
const normalizePlanKey = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Repairs legacy schemas where plan_key was accidentally globally unique.
 * The business rule is UNIQUE(app_id, plan_key).
 * This is idempotent and runs only once per server instance.
 */
let planSchemaReady: Promise<void> | null = null;
async function ensurePlanSchema(sql: any) {
  if (!planSchemaReady) {
    planSchemaReady = (async () => {
      await sql`ALTER TABLE app_plans DROP CONSTRAINT IF EXISTS app_plans_plan_key_key`;
      const indexes = (await sql.query(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = current_schema()
            AND tablename = 'app_plans'
            AND indexdef ILIKE 'CREATE UNIQUE INDEX%'`,
      )) as Array<{ indexname: string; indexdef: string }>;

      for (const index of indexes) {
        const definition = index.indexdef.replace(/\s+/g, " ").toLowerCase();
        const isPlanKeyOnly = /\(\s*plan_key\s*\)/.test(definition);
        const isAppPlanKey = /\(\s*app_id\s*,\s*plan_key\s*\)/.test(definition);
        const isPlanKeyApp = /\(\s*plan_key\s*,\s*app_id\s*\)/.test(definition);
        if (isPlanKeyOnly && !isAppPlanKey && !isPlanKeyApp) {
          const safeName = index.indexname.replace(/"/g, '""');
          await sql.query(`DROP INDEX IF EXISTS "${safeName}"`);
        }
      }

      await sql`CREATE UNIQUE INDEX IF NOT EXISTS app_plans_app_id_plan_key_uq ON app_plans (app_id, plan_key)`;
    })().catch((error) => {
      planSchemaReady = null;
      throw error;
    });
  }
  return planSchemaReady;
}

export const getAppPlans = createServerFn({ method: "GET" })
  .inputValidator((input) => appIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();
    await ensurePlanSchema(sql);

    const appCheck = (await sql.query(`SELECT id FROM apps WHERE id = $1 AND owner_id = $2`, [data.appId, user.id])) as { id: string }[];
    if (appCheck.length === 0) throw new Error("Application non trouvée ou non autorisée");

    return (await sql.query(
      `SELECT id, plan_key, name, amount::float8, currency, period, description, active, created_at
       FROM app_plans WHERE app_id = $1
       ORDER BY CASE period WHEN 'trial' THEN 1 WHEN 'monthly' THEN 2 WHEN 'yearly' THEN 3 ELSE 4 END, created_at ASC`,
      [data.appId],
    )) as Array<Record<string, unknown>>;
  });

/** Creates or updates a plan, with uniqueness scoped strictly to app_id. */
export const createAppPlan = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({
    appId: z.string().uuid(),
    planKey: z.string().trim().min(3).max(50),
    name: z.string().trim().min(3).max(100),
    amount: z.number().positive(),
    currency: z.string().trim().length(3).toUpperCase(),
    period: z.enum(["trial", "monthly", "yearly", "custom"]),
    description: z.string().trim().max(500).optional().or(z.literal("")),
  }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();
    await ensurePlanSchema(sql);
    const planKey = normalizePlanKey(data.planKey);
    if (planKey.length < 3) throw new Error("La clé du plan doit contenir au moins 3 caractères valides.");

    const appCheck = (await sql.query(`SELECT id FROM apps WHERE id = $1 AND owner_id = $2`, [data.appId, user.id])) as { id: string }[];
    if (appCheck.length === 0) throw new Error("Application non trouvée ou non autorisée");

    const existing = (await sql.query(
      `SELECT id FROM app_plans WHERE app_id = $1 AND LOWER(plan_key) = LOWER($2) LIMIT 1`,
      [data.appId, planKey],
    )) as { id: string }[];

    try {
      if (existing.length > 0) {
        const updated = await sql`
          UPDATE app_plans SET plan_key=${planKey}, name=${data.name}, amount=${data.amount}, currency=${data.currency},
            period=${data.period}, description=${data.description || null}, active=true, updated_at=now()
          WHERE id=${existing[0].id} AND app_id=${data.appId}
          RETURNING id, plan_key, name, amount::float8, currency, period, description, active`;
        return updated[0];
      }

      const inserted = await sql`
        INSERT INTO app_plans (app_id, plan_key, name, amount, currency, period, description, active)
        VALUES (${data.appId}, ${planKey}, ${data.name}, ${data.amount}, ${data.currency}, ${data.period}, ${data.description || null}, true)
        RETURNING id, plan_key, name, amount::float8, currency, period, description, active`;
      return inserted[0];
    } catch (error: any) {
      if (error?.code === "23505") {
        const concurrent = (await sql.query(
          `SELECT id FROM app_plans WHERE app_id = $1 AND LOWER(plan_key) = LOWER($2) LIMIT 1`,
          [data.appId, planKey],
        )) as { id: string }[];
        if (concurrent.length > 0) {
          const updated = await sql`
            UPDATE app_plans SET name=${data.name}, amount=${data.amount}, currency=${data.currency},
              period=${data.period}, description=${data.description || null}, active=true, updated_at=now()
            WHERE id=${concurrent[0].id} AND app_id=${data.appId}
            RETURNING id, plan_key, name, amount::float8, currency, period, description, active`;
          if (updated[0]) return updated[0];
        }
        throw new Error("Cette clé de plan est déjà utilisée par cette application.");
      }
      console.error("[createAppPlan] Erreur:", error);
      throw new Error("Impossible d'enregistrer ce plan. Vérifiez les paramètres du plan et réessayez.");
    }
  });

export const updateAppPlan = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({
    planId: z.string().uuid(), appId: z.string().uuid(), name: z.string().trim().min(3).max(100),
    amount: z.number().positive(), currency: z.string().trim().length(3).toUpperCase(),
    period: z.enum(["trial", "monthly", "yearly", "custom"]), description: z.string().trim().max(500).optional().or(z.literal("")), active: z.boolean(),
  }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server"); const { requireUser } = await import("./auth.server");
    const user = await requireUser(); const sql = db();
    const appCheck = (await sql.query(`SELECT id FROM apps WHERE id = $1 AND owner_id = $2`, [data.appId, user.id])) as { id: string }[];
    if (appCheck.length === 0) throw new Error("Application non trouvée ou non autorisée");
    await sql`UPDATE app_plans SET name=${data.name}, amount=${data.amount}, currency=${data.currency}, period=${data.period}, description=${data.description || null}, active=${data.active}, updated_at=now() WHERE id=${data.planId} AND app_id=${data.appId}`;
    return { ok: true };
  });

export const deleteAppPlan = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ planId: z.string().uuid(), appId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server"); const { requireUser } = await import("./auth.server");
    const user = await requireUser(); const sql = db();
    const appCheck = (await sql.query(`SELECT id FROM apps WHERE id = $1 AND owner_id = $2`, [data.appId, user.id])) as { id: string }[];
    if (appCheck.length === 0) throw new Error("Application non trouvée ou non autorisée");
    await sql`UPDATE app_plans SET active=false, updated_at=now() WHERE id=${data.planId} AND app_id=${data.appId}`;
    return { ok: true };
  });

export const getExchangeRates = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("./db.server"); const sql = db();
  return (await sql`SELECT DISTINCT ON (currency) currency, rate_to_htg::float8, effective_on, source FROM exchange_rates WHERE effective_on <= CURRENT_DATE ORDER BY currency, effective_on DESC`) as Array<Record<string, unknown>>;
});

export const updateExchangeRate = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ currency: z.string().trim().length(3).toUpperCase(), rateToHtg: z.number().positive(), source: z.string().trim().default("manual") }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server"); const { requireUser } = await import("./auth.server");
    const user = await requireUser(); const sql = db();
    const isAdmin = user.role === "admin" || user.email?.endsWith("@zaka.ht");
    if (!isAdmin) throw new Error("Non autorisé. Seuls les administrateurs peuvent modifier les taux de change.");
    try {
      await sql`INSERT INTO exchange_rates (currency, rate_to_htg, effective_on, source) VALUES (${data.currency}, ${data.rateToHtg}, CURRENT_DATE, ${data.source}) ON CONFLICT (currency, effective_on) DO UPDATE SET rate_to_htg=EXCLUDED.rate_to_htg, source=EXCLUDED.source, updated_at=now()`;
      return { ok: true };
    } catch (error) {
      console.error("[updateExchangeRate] Erreur:", error);
      throw new Error("Impossible de mettre à jour le taux de change.");
    }
  });
