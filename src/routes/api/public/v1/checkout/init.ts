import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  user_id: z.string().trim().min(1).max(80),
  account_name: z.string().trim().min(3).max(80),
  user_phone: z.string().trim().max(20).optional(),
  provider: z.enum(["moncash", "natcash"]).default("moncash"),
  plan_id: z.string().uuid().optional(),
  plan_type: z.string().trim().min(1).max(80).default("monthly"),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/public/v1/checkout/init")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey) return json({ error: "Clé API manquante (x-api-key)" }, 401);

        const { requireActiveApiApp } = await import("@/lib/api-access");
        const access = await requireActiveApiApp(apiKey);
        if (!access.app) return json({ error: access.error }, access.status);
        const app = access.app;
        const { db } = await import("@/lib/db.server");
        const sql = db();

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return json({ error: "Corps invalide", details: parsed.error.flatten() }, 400);
        }
        const body = parsed.data;
        const plans = (await sql`
          SELECT p.id, p.plan_key, p.amount, p.currency, r.rate_to_htg
          FROM app_plans p
          LEFT JOIN LATERAL (
            SELECT rate_to_htg FROM exchange_rates
            WHERE currency = p.currency AND effective_on <= CURRENT_DATE
            ORDER BY effective_on DESC LIMIT 1
          ) r ON true
          WHERE p.app_id = ${app.id}
            AND p.active = true
            AND (${body.plan_id ?? null}::uuid IS NULL AND p.plan_key = ${body.plan_type}
                 OR ${body.plan_id ?? null}::uuid IS NOT NULL AND p.id = ${body.plan_id ?? null}::uuid)
          LIMIT 1
        `) as {
          id: string;
          plan_key: string;
          amount: string;
          currency: string;
          rate_to_htg: string | null;
        }[];
        const plan = plans[0];
        if (!plan || !plan.rate_to_htg) {
          return json({ error: "Plan inconnu ou taux de change indisponible" }, 422);
        }
        const sourceAmount = Number(plan.amount);
        const exchangeRate = Number(plan.rate_to_htg);
        const amount = Math.ceil(sourceAmount * exchangeRate);

        const rows = (await sql`
          INSERT INTO subscriptions (app_id, user_id, user_phone, account_name, provider, plan_type, amount,
                                     source_amount, source_currency, exchange_rate, plan_id, status)
          VALUES (${app.id}, ${body.user_id}, ${body.user_phone ?? null}, ${body.account_name},
                  ${body.provider}, ${plan.plan_key}, ${amount}, ${sourceAmount}, ${plan.currency},
                  ${exchangeRate}, ${plan.id}, 'pending')
          RETURNING id, amount, status, created_at
        `) as { id: string; amount: string; status: string; created_at: string }[];

        const row = rows[0]!;
        return json({
          subscription_id: row.id,
          app: app.name,
          amount: Number(row.amount),
          status: row.status,
          provider: body.provider,
          created_at: row.created_at,
        });
      },
    },
  },
});
