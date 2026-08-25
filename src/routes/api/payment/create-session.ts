import { createServerRoute } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "../../../lib/db.server";
import { getExchangeRate, convertCurrency } from "../../../lib/currency.functions";

const createSessionSchema = z.object({
  plan_key: z.string(),
  user_id: z.string(),
  currency: z.string().optional().default("USD"),
});

export const createServerFn = createServerRoute()
  .methods(["POST", "OPTIONS"])
  .validator(createSessionSchema)
  .handler(async ({ request, data }) => {
    // Gérer les requêtes OPTIONS (CORS preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-api-key",
        },
      });
    }

    try {
      const { plan_key, user_id, currency } = data;

      // Récupérer la clé API depuis les headers
      const apiKey = request.headers.get("x-api-key");
      
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "Clé API manquante" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      // Vérifier l'application et sa configuration
      const appResult = await db`
        SELECT a.*, ap.amount as plan_amount, ap.currency as plan_currency
        FROM apps a
        LEFT JOIN app_plans ap ON a.id = ap.app_id AND ap.plan_key = ${plan_key}
        WHERE a.api_key = ${apiKey}
        LIMIT 1
      `;

      if (!appResult || appResult.length === 0) {
        return new Response(
          JSON.stringify({ error: "Application ou clé API invalide" }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      const app = appResult[0];
      
      // Si le plan personnalisé n'existe pas, utiliser les valeurs par défaut
      let amount = app.plan_amount || 15; // Défaut: $15
      let planCurrency = app.plan_currency || "USD";

      // Convertir en HTG si nécessaire
      const htgAmount = planCurrency.toUpperCase() === "HTG" 
        ? Number(amount)
        : convertCurrency(Number(amount), planCurrency, "HTG");

      // Créer une session de paiement unique
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Enregistrer la session en base de données
      await db`
        INSERT INTO payment_sessions (
          session_id,
          app_id,
          user_id,
          plan_key,
          amount_original,
          currency_original,
          amount_htg,
          status,
          created_at
        ) VALUES (
          ${sessionId},
          ${app.id},
          ${user_id},
          ${plan_key},
          ${amount},
          ${planCurrency},
          ${htgAmount},
          pending,
          NOW()
        )
      `;

      // Retourner la session avec les informations de paiement
      return new Response(
        JSON.stringify({
          session_id: sessionId,
          plan_key,
          amount: Number(amount),
          currency: planCurrency,
          amount_htg: htgAmount,
          redirect_url: `https://zakaproht.vercel.app/pay?session_id=${sessionId}`,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-api-key",
          },
        }
      );
    } catch (error) {
      console.error("[create-session] Error:", error);
      return new Response(
        JSON.stringify({ error: "Erreur interne du serveur" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  });
