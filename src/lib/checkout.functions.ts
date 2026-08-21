import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const initSchema = z.object({
  appId: z.string().uuid(),
  userId: z.string().trim().min(1).max(80),
  accountName: z.string().trim().min(3, "Nom trop court").max(80),
  userPhone: z.string().trim().max(20).optional().or(z.literal("")),
  provider: z.enum(["moncash", "natcash"]),
  planType: z.enum(["monthly", "yearly"]),
  // Nouveau: permet de spécifier un plan personnalisé
  customPlanKey: z.string().trim().max(50).optional(),
});

/** Démo interne du tunnel de paiement (les apps tierces passent par /api/v1/checkout/init). */
export const initDemoCheckout = createServerFn({ method: "POST" })
  .inputValidator((input) => initSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const sql = db();
    
    let amount: number;
    
    // Si un plan personnalisé est spécifié, récupérer son montant converti en HTG
    if (data.customPlanKey) {
      const { calculatePlanAmountInHTG } = await import("./currency.functions");
      const planInfo = await calculatePlanAmountInHTG(data.appId, data.customPlanKey);
      
      if (!planInfo.planExists) {
        throw new Error(`Le plan personnalisé "${data.customPlanKey}" n'existe pas ou n'est pas actif`);
      }
      
      amount = planInfo.htgAmount;
      console.log(`[initDemoCheckout] Plan personnalisé: ${planInfo.label}, ${planInfo.originalAmount} ${planInfo.currency} -> ${amount} HTG (taux: ${planInfo.rate})`);
    } else {
      // Utiliser les montants par défaut (abonnement Zaka Pro)
      amount = data.planType === "yearly" ? 2500 : 250;
    }

    const rows = (await sql`
      INSERT INTO subscriptions (app_id, user_id, user_phone, account_name, provider, plan_type, amount, status)
      VALUES (${data.appId}, ${data.userId}, ${data.userPhone || null}, ${data.accountName},
              ${data.provider}, ${data.planType}, ${amount}, 'pending')
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
};

/** Résout une application à partir de sa clé API publique de redirection (page /pay). */
export const resolveAppByApiKey = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ apiKey: z.string().trim().min(10).max(120) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { db } = await import("./db.server");
      const sql = db();
      
      // Validation du format de la clé API (doit commencer par sk_live_ ou sk_test_)
      const apiKey = data.apiKey.trim();
      if (!apiKey.startsWith("sk_")) {
        console.warn("[resolveAppByApiKey] Format de clé API invalide:", apiKey.substring(0, 10) + "...");
        return null;
      }
      
      const rows = (await sql`
        SELECT id, name, moncash_number, natcash_number, qr_image_url
        FROM apps WHERE api_key = ${apiKey} LIMIT 1
      `) as PublicApp[];
      
      const app = rows[0] ?? null;
      
      if (!app) {
        console.warn("[resolveAppByApiKey] Clé API non trouvée dans la base de données:", apiKey.substring(0, 15) + "...");
      }
      
      return app;
    } catch (error) {
      // Log l'erreur pour le débogage serveur
      console.error("[resolveAppByApiKey] Erreur lors de la résolution de l'application:", error);
      
      // En cas d'erreur de base de données ou autre, on retourne null au lieu de propager l'erreur
      // Cela évite de faire crasher toute la requête
      return null;
    }
  });

/** Récupère les plans personnalisés d'une application */
export const getAppPlans = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ appId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { db } = await import("./db.server");
      const sql = db();
      
      const rows = (await sql`
        SELECT plan_key, label, amount, currency, period, description, badge, sort_order
        FROM app_plans
        WHERE app_id = ${data.appId} AND is_active = true
        ORDER BY sort_order ASC, created_at ASC
      `) as { 
        plan_key: string; 
        label: string; 
        amount: string; 
        currency: string; 
        period: string; 
        description: string | null;
        badge: string | null;
        sort_order: number;
      }[];
      
      // Convertir les montants en HTG pour chaque plan
      const plansWithHTG = await Promise.all(
        rows.map(async (row) => {
          let htgAmount: number;
          let rate: number;
          
          if (row.currency === "HTG") {
            htgAmount = Number(row.amount);
            rate = 1;
          } else {
            const { calculatePlanAmountInHTG } = await import("./currency.functions");
            const planInfo = await calculatePlanAmountInHTG(data.appId, row.plan_key);
            htgAmount = planInfo.htgAmount;
            rate = planInfo.rate;
          }
          
          return {
            id: row.plan_key,
            label: row.label,
            originalAmount: Number(row.amount),
            currency: row.currency,
            htgAmount,
            rate,
            period: row.period,
            description: row.description,
            badge: row.badge,
          };
        })
      );
      
      return plansWithHTG;
    } catch (error) {
      console.error("[getAppPlans] Erreur lors de la récupération des plans:", error);
      return [];
    }
  });

/** Liste publique et minimale des applications connectées (démo du tunnel). */
export const listPublicApps = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("./db.server");
  const sql = db();
  return (await sql`
    SELECT id, name, slug FROM apps ORDER BY created_at ASC
  `) as { id: string; name: string; slug: string }[];
});
