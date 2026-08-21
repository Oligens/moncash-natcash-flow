import { db } from "./db.server";

export type ApiApp = {
  id: string;
  name: string;
  owner_id: string | null;
  sender_whitelist?: string[] | null;
  amount_regex?: string | null;
  name_regex?: string | null;
  reference_regex?: string | null;
  strict_name_match?: boolean | null;
};

export async function getApiApp(apiKey: string): Promise<ApiApp | null> {
  const sql = db();
  const rows = (await sql`
    SELECT id, name, owner_id, sender_whitelist, amount_regex, name_regex, reference_regex, strict_name_match
    FROM apps WHERE api_key = ${apiKey} LIMIT 1
  `) as ApiApp[];
  return rows[0] ?? null;
}

/** API access depends on the developer subscription, never on deleting or rotating the key. */
export async function requireActiveApiApp(apiKey: string) {
  const app = await getApiApp(apiKey);
  if (!app) return { app: null, error: "Clé API invalide", status: 401 } as const;
  if (!app.owner_id) return { app: null, error: "Application sans propriétaire", status: 403 } as const;

  const sql = db();
  const rows = (await sql`
    SELECT status, expires_at
    FROM developer_subscriptions
    WHERE developer_id = ${app.owner_id}
      AND status IN ('active', 'trialing')
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at DESC NULLS FIRST LIMIT 1
  `) as { status: string; expires_at: string | null }[];
  if (!rows[0]) {
    return {
      app: null,
      error: "Abonnement SaaS développeur expiré ou inexistant",
      status: 402,
    } as const;
  }
  return { app, error: null, status: 200 } as const;
}