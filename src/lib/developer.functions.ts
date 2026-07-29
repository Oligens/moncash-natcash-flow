import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const appIdSchema = z.object({ appId: z.string().uuid() });

const APP_COLUMNS =
  "id, name, slug, api_key, created_at, owner_id, moncash_number, natcash_number, qr_image_url, sender_whitelist, amount_regex, name_regex, reference_regex, strict_name_match, relay_last_seen_at";

/** Applications appartenant au développeur connecté (RLS multi-tenant). */
export const listMyApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: apps, error } = await context.supabase
      .from("apps")
      .select(APP_COLUMNS)
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: subs, error: subsError } = await context.supabase
      .from("subscriptions")
      .select("app_id, status, amount");
    if (subsError) throw new Error(subsError.message);

    return (apps ?? []).map((app) => {
      const rows = (subs ?? []).filter((s) => s.app_id === app.id);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().trim().min(2).max(60) }).parse(input))
  .handler(async ({ data, context }) => {
    const slug = data.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);

    const { data: row, error } = await context.supabase
      .from("apps")
      .insert({ name: data.name, slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`, owner_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const getAppOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => appIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: app, error: appError } = await context.supabase
      .from("apps")
      .select(APP_COLUMNS)
      .eq("id", data.appId)
      .maybeSingle();
    if (appError) throw new Error(appError.message);
    if (!app) throw new Error("Application introuvable");

    const { data: subs, error } = await context.supabase
      .from("subscriptions")
      .select(
        "id, user_id, user_phone, account_name, provider, plan_type, amount, status, created_at, expires_at, reference",
      )
      .eq("app_id", data.appId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = subs ?? [];
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("apps")
      .update({
        name: data.name,
        moncash_number: data.moncashNumber || null,
        natcash_number: data.natcashNumber || null,
        qr_image_url: data.qrImageUrl || null,
        sender_whitelist: data.senderWhitelist,
        amount_regex: data.amountRegex,
        name_regex: data.nameRegex,
        reference_regex: data.referenceRegex,
        strict_name_match: data.strictNameMatch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.appId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const regenerateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => appIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const key = `sk_live_${crypto.randomUUID().replace(/-/g, "")}`;
    const { error } = await context.supabase
      .from("apps")
      .update({ api_key: key, updated_at: new Date().toISOString() })
      .eq("id", data.appId);
    if (error) throw new Error(error.message);
    return { apiKey: key };
  });

/** Journal des transferts du téléphone relais + statut de connexion. */
export const getRelayActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => appIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: app, error: appError } = await context.supabase
      .from("apps")
      .select("relay_last_seen_at")
      .eq("id", data.appId)
      .maybeSingle();
    if (appError) throw new Error(appError.message);

    const { data: logs, error } = await context.supabase
      .from("relay_logs")
      .select("id, raw_content, sender, status, detail, created_at")
      .eq("app_id", data.appId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);

    const lastSeen = app?.relay_last_seen_at ?? null;
    const online = lastSeen ? Date.now() - new Date(lastSeen).getTime() < 10 * 60 * 1000 : false;
    return { lastSeen, online, logs: logs ?? [] };
  });
