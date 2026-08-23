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

        const { requireActiveApiApp } = await import("@/lib/api-access");
        const access = await requireActiveApiApp(apiKey);
        if (!access.app) return json({ error: access.error }, access.status);
        const app = access.app;
        const { db } = await import("@/lib/db.server");
        const sql = db();

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
