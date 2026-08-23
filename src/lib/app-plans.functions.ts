import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const appIdSchema = z.object({ appId: z.string().uuid() });

/** Récupère tous les plans personnalisés d'une application */
export const getAppPlans = createServerFn({ method: "GET" })
  .inputValidator((input) => appIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();

    // Vérifier que l'app appartient à l'utilisateur
    const appCheck = (await sql.query(
      `SELECT id FROM apps WHERE id = $1 AND owner_id = $2`,
      [data.appId, user.id],
    )) as { id: string }[];

    if (!appCheck || appCheck.length === 0) {
      throw new Error("Application non trouvée ou non autorisée");
    }

    const plans = (await sql.query(
      `SELECT id, plan_key, name, amount::float8, currency, period, description, active, created_at
       FROM app_plans 
       WHERE app_id = $1 
       ORDER BY 
         CASE period 
           WHEN 'trial' THEN 1 
           WHEN 'monthly' THEN 2 
           WHEN 'yearly' THEN 3 
           ELSE 4 
         END,
         created_at ASC`,
      [data.appId],
    )) as Array<{
      id: string;
      plan_key: string;
      name: string;
      amount: number;
      currency: string;
      period: string;
      description: string | null;
      active: boolean;
      created_at: string;
    }>;

    return plans;
  });

/** Crée un nouveau plan personnalisé */
export const createAppPlan = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      appId: z.string().uuid(),
      planKey: z.string().trim().min(3).max(50),
      name: z.string().trim().min(3).max(100),
      amount: z.number().positive(),
      currency: z.string().trim().length(3).toUpperCase(),
      period: z.enum(["trial", "monthly", "yearly", "custom"]),
      description: z.string().trim().max(500).optional().or(z.literal("")),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();

    // Vérifier que l'app appartient à l'utilisateur
    const appCheck = (await sql.query(
      `SELECT id FROM apps WHERE id = $1 AND owner_id = $2`,
      [data.appId, user.id],
    )) as { id: string }[];

    if (!appCheck || appCheck.length === 0) {
      throw new Error("Application non trouvée ou non autorisée");
    }

    try {
      const newPlan = (await sql`
        INSERT INTO app_plans (app_id, plan_key, name, amount, currency, period, description, active)
        VALUES (${data.appId}, ${data.planKey}, ${data.name}, ${data.amount}, ${data.currency}, ${data.period}, ${data.description || null}, true)
        ON CONFLICT (app_id, plan_key) DO UPDATE SET
          name = EXCLUDED.name,
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          period = EXCLUDED.period,
          description = EXCLUDED.description,
          active = true,
          updated_at = now()
        RETURNING id, plan_key, name, amount::float8, currency, period, description, active
      `) as Array<{
        id: string;
        plan_key: string;
        name: string;
        amount: number;
        currency: string;
        period: string;
        description: string | null;
        active: boolean;
      }>;

      return newPlan[0];
    } catch (error) {
      console.error("[createAppPlan] Erreur:", error);
      throw new Error("Impossible de créer le plan. Vérifiez que la clé du plan est unique.");
    }
  });

/** Met à jour un plan existant */
export const updateAppPlan = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      planId: z.string().uuid(),
      appId: z.string().uuid(),
      name: z.string().trim().min(3).max(100),
      amount: z.number().positive(),
      currency: z.string().trim().length(3).toUpperCase(),
      period: z.enum(["trial", "monthly", "yearly", "custom"]),
      description: z.string().trim().max(500).optional().or(z.literal("")),
      active: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();

    // Vérifier que l'app appartient à l'utilisateur
    const appCheck = (await sql.query(
      `SELECT id FROM apps WHERE id = $1 AND owner_id = $2`,
      [data.appId, user.id],
    )) as { id: string }[];

    if (!appCheck || appCheck.length === 0) {
      throw new Error("Application non trouvée ou non autorisée");
    }

    await sql`
      UPDATE app_plans 
      SET name = ${data.name},
          amount = ${data.amount},
          currency = ${data.currency},
          period = ${data.period},
          description = ${data.description || null},
          active = ${data.active},
          updated_at = now()
      WHERE id = ${data.planId} AND app_id = ${data.appId}
    `;

    return { ok: true };
  });

/** Supprime un plan (désactivation logique) */
export const deleteAppPlan = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      planId: z.string().uuid(),
      appId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();

    // Vérifier que l'app appartient à l'utilisateur
    const appCheck = (await sql.query(
      `SELECT id FROM apps WHERE id = $1 AND owner_id = $2`,
      [data.appId, user.id],
    )) as { id: string }[];

    if (!appCheck || appCheck.length === 0) {
      throw new Error("Application non trouvée ou non autorisée");
    }

    await sql`
      UPDATE app_plans 
      SET active = false, updated_at = now()
      WHERE id = ${data.planId} AND app_id = ${data.appId}
    `;

    return { ok: true };
  });

/** Récupère les taux de change actuels */
export const getExchangeRates = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("./db.server");
  const sql = db();

  const rates = (await sql`
    SELECT DISTINCT ON (currency) currency, rate_to_htg::float8, effective_on, source
    FROM exchange_rates
    WHERE effective_on <= CURRENT_DATE
    ORDER BY currency, effective_on DESC
  `) as Array<{
    currency: string;
    rate_to_htg: number;
    effective_on: string;
    source: string;
  }>;

  return rates;
});

/** Met à jour ou crée un taux de change */
export const updateExchangeRate = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      currency: z.string().trim().length(3).toUpperCase(),
      rateToHtg: z.number().positive(),
      source: z.string().trim().default("manual"),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();

    // Vérifier que l'utilisateur est admin (optionnel, à adapter selon votre logique)
    const isAdmin = user.role === "admin" || user.email?.endsWith("@zaka.ht");
    if (!isAdmin) {
      throw new Error("Non autorisé. Seuls les administrateurs peuvent modifier les taux de change.");
    }

    try {
      await sql`
        INSERT INTO exchange_rates (currency, rate_to_htg, effective_on, source)
        VALUES (${data.currency}, ${data.rateToHtg}, CURRENT_DATE, ${data.source})
        ON CONFLICT (currency, effective_on) DO UPDATE SET
          rate_to_htg = EXCLUDED.rate_to_htg,
          source = EXCLUDED.source,
          updated_at = now()
      `;
      return { ok: true };
    } catch (error) {
      console.error("[updateExchangeRate] Erreur:", error);
      throw new Error("Impossible de mettre à jour le taux de change.");
    }
  });
