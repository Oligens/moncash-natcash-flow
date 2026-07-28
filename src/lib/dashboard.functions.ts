import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: apps, error } = await context.supabase
      .from("apps")
      .select("id, name, slug, api_key, created_at")
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

export const getAppOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ appId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: app, error: appError } = await context.supabase
      .from("apps")
      .select("id, name, slug, api_key, created_at")
      .eq("id", data.appId)
      .maybeSingle();
    if (appError) throw new Error(appError.message);
    if (!app) throw new Error("Application introuvable");

    const { data: subs, error } = await context.supabase
      .from("subscriptions")
      .select(
        "id, user_id, user_phone, account_name, provider, plan_type, amount, status, created_at, expires_at",
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

    // Série mensuelle sur 6 mois : revenus + souscriptions
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
