import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const initSchema = z.object({
  appId: z.string().uuid(),
  userId: z.string().trim().min(1).max(80),
  accountName: z.string().trim().min(3, "Nom trop court").max(80),
  userPhone: z.string().trim().max(20).optional().or(z.literal("")),
  provider: z.enum(["moncash", "natcash"]),
  planType: z.enum(["monthly", "yearly"]),
});

/** Démo interne du tunnel de paiement (les apps tierces passent par /api/v1/checkout/init). */
export const initDemoCheckout = createServerFn({ method: "POST" })
  .inputValidator((input) => initSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const amount = data.planType === "yearly" ? 2500 : 250;

    const { data: row, error } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        app_id: data.appId,
        user_id: data.userId,
        user_phone: data.userPhone || null,
        account_name: data.accountName,
        provider: data.provider,
        plan_type: data.planType,
        amount,
        status: "pending",
      })
      .select("id, amount, status")
      .single();

    if (error) throw new Error(error.message);
    return { subscriptionId: row.id, amount: Number(row.amount), status: row.status };
  });

export const getCheckoutStatus = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ subscriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("subscriptions")
      .select("status, expires_at")
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { status: row?.status ?? "unknown", expiresAt: row?.expires_at ?? null };
  });

/** Liste publique et minimale des applications connectées (démo du tunnel). */
export const listPublicApps = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("apps")
    .select("id, name, slug")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});
