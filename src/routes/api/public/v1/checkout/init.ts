import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  user_id: z.string().trim().min(1).max(80),
  account_name: z.string().trim().min(3).max(80),
  user_phone: z.string().trim().max(20).optional(),
  provider: z.enum(["moncash", "natcash"]).default("moncash"),
  plan_type: z.enum(["monthly", "yearly"]).default("monthly"),
  amount: z.number().positive().max(1000000).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/public/v1/checkout/init")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey) return json({ error: "Clé API manquante (x-api-key)" }, 401);

        const { db } = await import("@/lib/db.server");
        const sql = db();
        const apps = (await sql`SELECT id, name FROM apps WHERE api_key = ${apiKey} LIMIT 1`) as {
          id: string;
          name: string;
        }[];
        const app = apps[0];
        if (!app) return json({ error: "Clé API invalide" }, 401);

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return json({ error: "Corps invalide", details: parsed.error.flatten() }, 400);
        }
        const body = parsed.data;
        const amount = body.amount ?? (body.plan_type === "yearly" ? 2500 : 250);

        const rows = (await sql`
          INSERT INTO subscriptions (app_id, user_id, user_phone, account_name, provider, plan_type, amount, status)
          VALUES (${app.id}, ${body.user_id}, ${body.user_phone ?? null}, ${body.account_name},
                  ${body.provider}, ${body.plan_type}, ${amount}, 'pending')
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
