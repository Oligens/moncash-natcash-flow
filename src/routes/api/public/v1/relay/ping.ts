import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Appelé par l'application mobile Zaka Relay pour s'associer et signaler sa présence. */
export const Route = createFileRoute("/api/public/v1/relay/ping")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey) return json({ error: "Clé API manquante (x-api-key)" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: app } = await supabaseAdmin
          .from("apps")
          .select("id, name, sender_whitelist")
          .eq("api_key", apiKey)
          .maybeSingle();
        if (!app) return json({ error: "Clé API invalide" }, 401);

        await supabaseAdmin
          .from("apps")
          .update({ relay_last_seen_at: new Date().toISOString() })
          .eq("id", app.id);

        return json({
          paired: true,
          app: app.name,
          sender_whitelist: app.sender_whitelist ?? [],
          webhook_path: "/api/public/webhook/sms",
        });
      },
    },
  },
});
