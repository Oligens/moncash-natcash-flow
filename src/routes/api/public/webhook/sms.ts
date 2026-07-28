import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseSms, normalizeName } from "@/lib/sms-parser";

const bodySchema = z.object({
  message: z.string().min(3).max(2000),
  sender: z.string().max(30).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/public/webhook/sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey) return json({ error: "Clé API manquante (x-api-key)" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: app } = await supabaseAdmin
          .from("apps")
          .select("id")
          .eq("api_key", apiKey)
          .maybeSingle();
        if (!app) return json({ error: "Clé API invalide" }, 401);

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Corps de requête invalide" }, 400);

        const { amount, phone, name } = parseSms(parsed.data.message);
        const senderPhone = parsed.data.sender ?? phone;

        if (amount == null) {
          await supabaseAdmin.from("sms_logs").insert({
            raw_content: parsed.data.message,
            sender_phone: senderPhone,
            amount_detected: null,
          });
          return json({ matched: false, reason: "Montant non détecté" }, 200);
        }

        const { data: candidates } = await supabaseAdmin
          .from("subscriptions")
          .select("id, account_name, user_phone, plan_type, amount")
          .eq("status", "pending")
          .eq("amount", amount)
          .order("created_at", { ascending: true });

        const list = candidates ?? [];
        let match =
          (senderPhone && list.find((c) => (c.user_phone ?? "").replace(/\D/g, "").endsWith(senderPhone.replace(/\D/g, "").slice(-8)))) ||
          (name && list.find((c) => normalizeName(c.account_name) === normalizeName(name))) ||
          null;
        if (!match && list.length === 1) match = list[0];

        if (!match) {
          await supabaseAdmin.from("sms_logs").insert({
            raw_content: parsed.data.message,
            sender_phone: senderPhone,
            amount_detected: amount,
          });
          return json({ matched: false, reason: "Aucun abonnement en attente correspondant" }, 200);
        }

        const expiresAt = new Date();
        if (match.plan_type === "yearly") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        else expiresAt.setMonth(expiresAt.getMonth() + 1);

        const { error: updateError } = await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "active",
            expires_at: expiresAt.toISOString(),
            user_phone: senderPhone ?? undefined,
          })
          .eq("id", match.id);
        if (updateError) return json({ error: updateError.message }, 500);

        await supabaseAdmin.from("sms_logs").insert({
          raw_content: parsed.data.message,
          sender_phone: senderPhone,
          amount_detected: amount,
          matched_subscription_id: match.id,
        });

        return json({
          matched: true,
          subscription_id: match.id,
          status: "active",
          expires_at: expiresAt.toISOString(),
        });
      },
    },
  },
});
