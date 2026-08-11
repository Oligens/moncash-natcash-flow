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

        const { db } = await import("@/lib/db.server");
        const sql = db();
        const apps = (await sql`SELECT id FROM apps WHERE api_key = ${apiKey} LIMIT 1`) as {
          id: string;
        }[];
        const app = apps[0];
        if (!app) return json({ error: "Clé API invalide" }, 401);

        const rows = (await sql`
          SELECT id, status, plan_type, expires_at FROM subscriptions
          WHERE app_id = ${app.id} AND user_id = ${userId} AND status = 'active'
          ORDER BY expires_at DESC NULLS LAST LIMIT 1
        `) as { id: string; status: string; plan_type: string; expires_at: string | null }[];
        const sub = rows[0];

        const expired = sub?.expires_at ? new Date(sub.expires_at).getTime() < Date.now() : false;
        if (!sub || expired) {
          if (sub && expired) {
            await sql`UPDATE subscriptions SET status = 'expired' WHERE id = ${sub.id}`;
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
