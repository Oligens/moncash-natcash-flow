import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const appIdSchema = z.object({ appId: z.string().uuid() });

const normalizePlanKey = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

/** Récupère tous les plans personnalisés d'une application */
export const getAppPlans = createServerFn({ method: "GET" })
  .inputValidator((input) => appIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();

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

/**
 * Crée ou met à jour un plan personnalisé.
 *
 * On ne dépend pas d'un nom précis de contrainte SQL pour l'upsert :
 * on recherche d'abord le plan dans l'application, puis on UPDATE ou INSERT.
 * Cela reste compatible avec les schémas existants qui n'ont pas exactement
 * la même contrainte UNIQUE.
 */
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
    const planKey = normalizePlanKey(data.planKey);

    if (planKey.length < 3) {
      throw new Error("La clé du plan doit contenir au moins 3 caractères valides.");
    }

    const appCheck = (await sql.query(
      `SELECT id FROM apps WHERE id = $1 AND owner_id = $2`,
      [data.appId, user.id],
    )) as { id: string }[];

    if (!appCheck || appCheck.length === 0) {
      throw new Error("Application non trouvée ou non autorisée");
    }

    const existing = (await sql.query(
      `SELECT id FROM app_plans WHERE app_id = $1 AND LOWER(plan_key) = LOWER($2) LIMIT 1`,
      [data.appId, planKey],
    )) as { id: string }[];

    try {
      if (existing.length > 0) {
        const updated = (await sql`
          UPDATE app_plans
          SET plan_key = ${planKey},
              name = ${data.name},
              amount = ${data.amount},
              currency = ${data.currency},
              period = ${data.period},
              description = ${data.description || null},
              active = true,
              updated_at = now()
          WHERE id = ${existing[0].id} AND app_id = ${data.appId}
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

        return updated[0];
      }

      const inserted = (await sql`
        INSERT INTO app_plans (app_id, plan_key, name, amount, currency, period, description, active)
        VALUES (${data.appId}, ${planKey}, ${data.name}, ${data.amount}, ${data.currency}, ${data.period}, ${data.description || null}, true)
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

      return inserted[0];
    } catch (error: any) {
      // Si deux requêtes concurrentes ont tenté la même clé, relire puis
      // mettre à jour le plan existant au lieu d'exposer une erreur 23505.
      if (error?.code === "23505") {
        const concurrent = (await sql.query(
          `SELECT id FROM app_plans WHERE app_id = $1 AND LOWER(plan_key) = LOWER($2) LIMIT 1`,
          [data.appId, planKey],
        )) as { id: string }[];

        if (concurrent.length > 0) {
          const updated = (await sql`
            UPDATE app_plans
            SET name = ${data.name},
                amount = ${data.amount},
                currency = ${data.currency},
                period = ${data.period},
                description = ${data.description || null},
                active = true,
                updated_at = now()
            WHERE id = ${concurrent[0].id} AND app_id = ${data.appId}
            RETURNING id, plan_key, name, amount::float8, currency, period, description, active
          `) as Array<any>;
          if (updated[0]) return updated[0];
        }
      }

      console.error("[createAppPlan] Erreur:", error);
      throw new Error("Impossible d'enregistrer ce plan. Utilisez une clé différente si cette clé est déjà utilisée par une autre application.");
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
