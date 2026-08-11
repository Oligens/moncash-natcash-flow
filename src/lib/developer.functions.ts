import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const appIdSchema = z.object({ appId: z.string().uuid() });

const APP_COLUMNS = `id, name, slug, api_key, created_at, owner_id, moncash_number, natcash_number,
  qr_image_url, sender_whitelist, amount_regex, name_regex, reference_regex, strict_name_match, relay_last_seen_at`;

type AppRow = Record<string, unknown> & { id: string };

/** Applications appartenant au développeur connecté (isolation multi-tenant). */
export const listMyApps = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("./db.server");
  const { requireUser } = await import("./auth.server");
  const user = await requireUser();
  const sql = db();

  const apps = (await sql.query(
    `SELECT ${APP_COLUMNS} FROM apps WHERE owner_id = $1 ORDER BY created_at ASC`,
    [user.id],
  )) as AppRow[];

  const subs = (await sql.query(
    `SELECT s.app_id, s.status, s.amount FROM subscriptions s
     JOIN apps a ON a.id = s.app_id WHERE a.owner_id = $1`,
    [user.id],
  )) as { app_id: string; status: string; amount: string }[];

  return apps.map((app) => {
    const rows = subs.filter((s) => s.app_id === app.id);
    return {
      ...app,
      activeCount: rows.filter((r) => r.status === "active").length,
      pendingCount: rows.filter((r) => r.status === "pending").length,
      revenue: rows
        .filter((r) => r.status === "active")
        .reduce((sum, r) => sum + Number(r.amount), 0),
    };
  });
});

export const createApp = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ name: z.string().trim().min(2).max(60) }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();

    const base = data.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

    const rows = (await sql`
      INSERT INTO apps (name, slug, owner_id) VALUES (${data.name}, ${slug}, ${user.id}) RETURNING id
    `) as { id: string }[];
    return { id: rows[0]!.id };
  });

async function ownedApp(appId: string, ownerId: string) {
  const { db } = await import("./db.server");
  const sql = db();
  const rows = (await sql.query(`SELECT ${APP_COLUMNS} FROM apps WHERE id = $1 AND owner_id = $2`, [
    appId,
    ownerId,
  ])) as AppRow[];
  const app = rows[0];
  if (!app) throw new Error("Application introuvable");
  return app;
}

export const getAppOverview = createServerFn({ method: "GET" })
  .inputValidator((input) => appIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const app = await ownedApp(data.appId, user.id);
    const sql = db();

    const subs = (await sql.query(
      `SELECT id, user_id, user_phone, account_name, provider, plan_type, amount, status, reference,
              created_at, expires_at
       FROM subscriptions WHERE app_id = $1 ORDER BY created_at DESC`,
      [data.appId],
    )) as {
      status: string;
      amount: string;
      created_at: string;
      expires_at: string | null;
    }[];

    const rows = subs;
    const active = rows.filter((r) => r.status === "active");
    const revenue = active.reduce((sum, r) => sum + Number(r.amount), 0);
    const soon = active.filter((r) => {
      if (!r.expires_at) return false;
      const diff = new Date(r.expires_at).getTime() - Date.now();
      return diff > 0 && diff < 7 * 24 * 3600 * 1000;
    }).length;
    const conversion = rows.length ? Math.round((active.length / rows.length) * 100) : 0;

    const months: { month: string; revenus: number; souscriptions: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d);
      const inMonth = rows.filter((r) => {
        const c = new Date(r.created_at);
        return `${c.getFullYear()}-${c.getMonth()}` === key;
      });
      months.push({
        month: label,
        revenus: inMonth
          .filter((r) => r.status === "active")
          .reduce((sum, r) => sum + Number(r.amount), 0),
        souscriptions: inMonth.length,
      });
    }

    return {
      app,
      kpis: {
        activeCount: active.length,
        revenue,
        conversion,
        expiringSoon: soon,
        total: rows.length,
      },
      chart: months,
      transactions: rows.slice(0, 25),
    };
  });

const settingsSchema = z.object({
  appId: z.string().uuid(),
  name: z.string().trim().min(2).max(60),
  moncashNumber: z.string().trim().max(30).nullable(),
  natcashNumber: z.string().trim().max(30).nullable(),
  qrImageUrl: z.string().trim().max(500).nullable(),
  senderWhitelist: z.array(z.string().trim().min(1).max(40)).max(20),
  amountRegex: z.string().trim().min(1).max(400),
  nameRegex: z.string().trim().min(1).max(400),
  referenceRegex: z.string().trim().min(1).max(400),
  strictNameMatch: z.boolean(),
});

export const updateAppSettings = createServerFn({ method: "POST" })
  .inputValidator((input) => settingsSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();

    await sql.query(
      `UPDATE apps SET name = $1, moncash_number = $2, natcash_number = $3, qr_image_url = $4,
         sender_whitelist = $5, amount_regex = $6, name_regex = $7, reference_regex = $8,
         strict_name_match = $9, updated_at = now()
       WHERE id = $10 AND owner_id = $11`,
      [
        data.name,
        data.moncashNumber || null,
        data.natcashNumber || null,
        data.qrImageUrl || null,
        data.senderWhitelist,
        data.amountRegex,
        data.nameRegex,
        data.referenceRegex,
        data.strictNameMatch,
        data.appId,
        user.id,
      ],
    );
    return { ok: true };
  });

export const regenerateApiKey = createServerFn({ method: "POST" })
  .inputValidator((input) => appIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const sql = db();
    const key = `sk_live_${crypto.randomUUID().replace(/-/g, "")}`;
    await sql`UPDATE apps SET api_key = ${key}, updated_at = now() WHERE id = ${data.appId} AND owner_id = ${user.id}`;
    return { apiKey: key };
  });

/** Journal des transferts du téléphone relais + statut de connexion. */
export const getRelayActivity = createServerFn({ method: "GET" })
  .inputValidator((input) => appIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    const user = await requireUser();
    const app = await ownedApp(data.appId, user.id);
    const sql = db();

    const logs = (await sql.query(
      `SELECT id, raw_content, sender, status, detail, created_at FROM relay_logs
       WHERE app_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [data.appId],
    )) as Record<string, unknown>[];

    const lastSeen = (app["relay_last_seen_at"] as string | null) ?? null;
    const online = lastSeen ? Date.now() - new Date(lastSeen).getTime() < 10 * 60 * 1000 : false;
    return { lastSeen, online, logs };
  });
