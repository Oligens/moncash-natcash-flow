import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/public/v1/license/verify")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey) return json({ error: "Clé API manquante (x-api-key)" }, 401);

        const userId = new URL(request.url).searchParams.get("user_id");
        if (!userId) return json({ error: "Paramètre user_id requis" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: app } = await supabaseAdmin
          .from("apps")
          .select("id")
          .eq("api_key", apiKey)
          .maybeSingle();
        if (!app) return json({ error: "Clé API invalide" }, 401);

        const { data: sub, error } = await supabaseAdmin
          .from("subscriptions")
          .select("id, status, plan_type, expires_at")
          .eq("app_id", app.id)
          .eq("user_id", userId)
          .eq("status", "active")
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);

        const expired = sub?.expires_at ? new Date(sub.expires_at).getTime() < Date.now() : false;
        if (!sub || expired) {
          if (sub && expired) {
            await supabaseAdmin.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
          }
          return json({ active: false, status: sub ? "expired" : "none" });
        }

        return json({
          active: true,
          status: "active",
          plan_type: sub.plan_type,
          expires_at: sub.expires_at,
        });
      },
    },
  },
});
