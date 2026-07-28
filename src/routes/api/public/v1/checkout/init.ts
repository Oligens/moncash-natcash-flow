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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: app } = await supabaseAdmin
          .from("apps")
          .select("id, name")
          .eq("api_key", apiKey)
          .maybeSingle();
        if (!app) return json({ error: "Clé API invalide" }, 401);

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return json({ error: "Corps invalide", details: parsed.error.flatten() }, 400);
        }
        const body = parsed.data;
        const amount = body.amount ?? (body.plan_type === "yearly" ? 2500 : 250);

        const { data: row, error } = await supabaseAdmin
          .from("subscriptions")
          .insert({
            app_id: app.id,
            user_id: body.user_id,
            user_phone: body.user_phone ?? null,
            account_name: body.account_name,
            provider: body.provider,
            plan_type: body.plan_type,
            amount,
            status: "pending",
          })
          .select("id, amount, status, created_at")
          .single();

        if (error) return json({ error: error.message }, 500);

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
