import { createServerRoute } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "../../../lib/db.server";
import { convertCurrency } from "../../../lib/currency.functions";

const createSessionSchema = z.object({
  plan_key: z.string().trim().min(1).max(80),
  user_id: z.string().trim().min(1).max(120),
  currency: z.string().trim().length(3).optional().default("USD"),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
    },
  });
}

export const createServerFn = createServerRoute()
  .methods(["POST", "OPTIONS"])
  .handler(async ({ request }) => {
    // IMPORTANT: handle preflight before parsing/validating a request body.
    // Browsers send OPTIONS without the POST JSON body, so a body validator
    // here would reject the preflight before CORS headers could be returned.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const rawBody = await request.json().catch(() => null);
      const parsed = createSessionSchema.safeParse(rawBody);
      if (!parsed.success) {
        return json({ error: "Données de paiement invalides", details: parsed.error.flatten() }, 400);
      }

      const { plan_key, user_id } = parsed.data;
      const apiKey = request.headers.get("x-api-key")?.trim();
      if (!apiKey) return json({ error: "Clé API manquante" }, 401);

      const appResult = await db`
        SELECT a.id, a.name, ap.id AS plan_id, ap.plan_key, ap.amount AS plan_amount, ap.currency AS plan_currency
        FROM apps a
        LEFT JOIN app_plans ap
          ON a.id = ap.app_id
         AND LOWER(ap.plan_key) = LOWER(${plan_key})
         AND ap.active = true
        WHERE a.api_key = ${apiKey}
        LIMIT 1
      `;

      if (!appResult?.length) return json({ error: "Application ou clé API invalide" }, 404);

      const app = appResult[0];
      if (!app.plan_id) {
        return json({ error: `Le plan « ${plan_key} » n'existe pas ou est désactivé pour cette application.` }, 422);
      }

      const amount = Number(app.plan_amount);
      const planCurrency = String(app.plan_currency || "USD").toUpperCase();
      if (!Number.isFinite(amount) || amount <= 0) {
        return json({ error: "Le montant du plan est invalide." }, 422);
      }

      const htgAmount = planCurrency === "HTG"
        ? amount
        : convertCurrency(amount, planCurrency, "HTG");

      if (!Number.isFinite(htgAmount) || htgAmount <= 0) {
        return json({ error: "Impossible de convertir le montant du plan en HTG." }, 422);
      }

      const sessionId = `sess_${crypto.randomUUID()}`;

      await db`
        INSERT INTO payment_sessions (
          session_id, app_id, user_id, plan_key,
          amount_original, currency_original, amount_htg,
          status, created_at
        ) VALUES (
          ${sessionId}, ${app.id}, ${user_id}, ${app.plan_key},
          ${amount}, ${planCurrency}, ${htgAmount},
          'pending', NOW()
        )
      `;

      return json({
        session_id: sessionId,
        plan_key: app.plan_key,
        plan_id: app.plan_id,
        amount,
        currency: planCurrency,
        amount_htg: htgAmount,
        redirect_url: `https://zakaproht.vercel.app/pay?api_key=${encodeURIComponent(apiKey)}&plan=${encodeURIComponent(app.plan_key)}&user_id=${encodeURIComponent(user_id)}`,
      });
    } catch (error) {
      console.error("[create-session] Error:", error);
      return json({ error: "Erreur interne du serveur" }, 500);
    }
  });
