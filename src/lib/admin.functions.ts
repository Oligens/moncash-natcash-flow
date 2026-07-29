import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès réservé à l'administrateur de la plateforme");
}

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: Boolean(data), userId: context.userId };
  });

export const getPlatformSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_settings")
      .select(
        "id, platform_name, saas_monthly_price, saas_yearly_price, trial_days, support_email, relay_apk_url",
      )
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const settingsSchema = z.object({
  id: z.string().uuid(),
  platformName: z.string().trim().min(2).max(60),
  saasMonthlyPrice: z.number().min(0).max(1000000),
  saasYearlyPrice: z.number().min(0).max(10000000),
  trialDays: z.number().int().min(0).max(365),
  supportEmail: z.string().trim().email(),
  relayApkUrl: z.string().trim().max(500),
});

export const updatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => settingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("platform_settings")
      .update({
        platform_name: data.platformName,
        saas_monthly_price: data.saasMonthlyPrice,
        saas_yearly_price: data.saasYearlyPrice,
        trial_days: data.trialDays,
        support_email: data.supportEmail,
        relay_apk_url: data.relayApkUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Vue globale : développeurs, applications, volume encaissé et factures SaaS. */
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: apps }, { data: subs }, { data: invoices }] = await Promise.all([
      supabaseAdmin.from("apps").select("id, name, slug, owner_id, created_at"),
      supabaseAdmin.from("subscriptions").select("app_id, status, amount"),
      supabaseAdmin
        .from("platform_invoices")
        .select("id, developer_id, developer_email, amount, period, status, due_date, created_at")
        .order("created_at", { ascending: false }),
    ]);

    const { data: userList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const emails = new Map((userList?.users ?? []).map((u) => [u.id, u.email ?? ""]));

    const byOwner = new Map<
      string,
      { developerId: string; email: string; apps: number; activeSubs: number; revenue: number }
    >();
    for (const app of apps ?? []) {
      const owner = app.owner_id ?? "orphan";
      const entry = byOwner.get(owner) ?? {
        developerId: owner,
        email: emails.get(owner) ?? "—",
        apps: 0,
        activeSubs: 0,
        revenue: 0,
      };
      entry.apps += 1;
      const rows = (subs ?? []).filter((s) => s.app_id === app.id && s.status === "active");
      entry.activeSubs += rows.length;
      entry.revenue += rows.reduce((sum, r) => sum + Number(r.amount), 0);
      byOwner.set(owner, entry);
    }

    return {
      developers: [...byOwner.values()].sort((a, b) => b.revenue - a.revenue),
      invoices: invoices ?? [],
      totals: {
        apps: (apps ?? []).length,
        activeSubs: (subs ?? []).filter((s) => s.status === "active").length,
        volume: (subs ?? [])
          .filter((s) => s.status === "active")
          .reduce((sum, s) => sum + Number(s.amount), 0),
        pendingInvoices: (invoices ?? []).filter((i) => i.status === "pending").length,
      },
      users: (userList?.users ?? []).map((u) => ({ id: u.id, email: u.email ?? "" })),
    };
  });

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        developerId: z.string().uuid(),
        developerEmail: z.string().trim().max(200).optional(),
        amount: z.number().positive().max(10000000),
        period: z.enum(["monthly", "yearly"]),
        dueDate: z.string().trim().min(4).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("platform_invoices").insert({
      developer_id: data.developerId,
      developer_email: data.developerEmail ?? null,
      amount: data.amount,
      period: data.period,
      due_date: data.dueDate,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        invoiceId: z.string().uuid(),
        status: z.enum(["pending", "paid", "cancelled"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("platform_invoices")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.invoiceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
