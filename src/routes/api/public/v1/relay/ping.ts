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

        const { db } = await import("@/lib/db.server");
        const sql = db();
        const apps = (await sql`
          SELECT id, name, sender_whitelist FROM apps WHERE api_key = ${apiKey} LIMIT 1
        `) as { id: string; name: string; sender_whitelist: string[] | null }[];
        const app = apps[0];
        if (!app) return json({ error: "Clé API invalide" }, 401);

        await sql`UPDATE apps SET relay_last_seen_at = now() WHERE id = ${app.id}`;

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
