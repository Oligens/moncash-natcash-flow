import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseSms, namesMatch, isSenderAllowed, DEFAULT_RULES } from "@/lib/sms-parser";

const bodySchema = z.object({
  message: z.string().min(3).max(2000),
  sender: z.string().max(60).optional(),
  received_at: z.string().max(40).optional(),
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
        // La clé API identifie le développeur et donc l'application ciblée.
        const { data: app } = await supabaseAdmin
          .from("apps")
          .select(
            "id, sender_whitelist, amount_regex, name_regex, reference_regex, strict_name_match",
          )
          .eq("api_key", apiKey)
          .maybeSingle();
        if (!app) return json({ error: "Clé API invalide" }, 401);

        // Toute requête authentifiée maintient le statut « en ligne » du relais.
        await supabaseAdmin
          .from("apps")
          .update({ relay_last_seen_at: new Date().toISOString() })
          .eq("id", app.id);

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Corps de requête invalide" }, 400);

        const message = parsed.data.message;
        const sender = parsed.data.sender ?? null;

        const logRelay = (status: string, detail: string) =>
          supabaseAdmin
            .from("relay_logs")
            .insert({ app_id: app.id, raw_content: message, sender, status, detail });

        const logSms = (fields: Record<string, unknown>) =>
          supabaseAdmin.from("sms_logs").insert({
            app_id: app.id,
            raw_content: message,
            sender_phone: sender,
            ...fields,
          });

        // 1. Whitelist des expéditeurs officiels
        const rules = {
          senderWhitelist: app.sender_whitelist ?? DEFAULT_RULES.senderWhitelist,
          amountRegex: app.amount_regex ?? DEFAULT_RULES.amountRegex,
          nameRegex: app.name_regex ?? DEFAULT_RULES.nameRegex,
          referenceRegex: app.reference_regex ?? DEFAULT_RULES.referenceRegex,
        };
        if (!isSenderAllowed(sender, rules.senderWhitelist)) {
          await Promise.all([
            logRelay("rejected", "Expéditeur hors whitelist"),
            logSms({ status: "rejected", reason: "Expéditeur non autorisé" }),
          ]);
          return json({ matched: false, reason: "Expéditeur non autorisé" }, 200);
        }

        // 2. Extraction intelligente
        const { amount, phone, name, reference } = parseSms(message, rules);
        if (amount == null) {
          await Promise.all([
            logRelay("failed", "Montant non détecté"),
            logSms({ status: "unmatched", reason: "Montant non détecté", sender_name: name, reference }),
          ]);
          return json({ matched: false, reason: "Montant non détecté" }, 200);
        }

        // 3. Validation croisée : montant du plan + nom du compte émetteur
        const { data: candidates } = await supabaseAdmin
          .from("subscriptions")
          .select("id, account_name, user_phone, plan_type, amount")
          .eq("app_id", app.id)
          .eq("status", "pending")
          .eq("amount", amount)
          .order("created_at", { ascending: true });

        const list = candidates ?? [];
        const strict = app.strict_name_match ?? true;
        const senderPhone = sender && /\d{6,}/.test(sender) ? sender : phone;

        let match =
          (name && list.find((c) => namesMatch(c.account_name, name, strict))) ||
          (senderPhone &&
            list.find((c) =>
              (c.user_phone ?? "")
                .replace(/\D/g, "")
                .endsWith(senderPhone.replace(/\D/g, "").slice(-8)),
            )) ||
          null;
        if (!match && !strict && list.length === 1) match = list[0];

        if (!match) {
          await Promise.all([
            logRelay("failed", "Aucun abonnement en attente correspondant"),
            logSms({
              status: "unmatched",
              amount_detected: amount,
              sender_name: name,
              reference,
              reason: "Aucun abonnement correspondant (montant ou nom)",
            }),
          ]);
          return json({ matched: false, reason: "Aucun abonnement en attente correspondant" }, 200);
        }

        // 4. Activation instantanée
        const expiresAt = new Date();
        if (match.plan_type === "yearly") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        else expiresAt.setMonth(expiresAt.getMonth() + 1);

        const { error: updateError } = await supabaseAdmin
          .from("subscriptions")
          .update({
            status: "active",
            expires_at: expiresAt.toISOString(),
            reference,
            user_phone: senderPhone ?? undefined,
          })
          .eq("id", match.id);
        if (updateError) {
          await logRelay("failed", updateError.message);
          return json({ error: updateError.message }, 500);
        }

        await Promise.all([
          logRelay("success", `Abonnement activé (${amount} HTG)`),
          logSms({
            status: "matched",
            amount_detected: amount,
            sender_name: name,
            reference,
            matched_subscription_id: match.id,
          }),
        ]);

        return json({
          matched: true,
          subscription_id: match.id,
          status: "active",
          reference,
          expires_at: expiresAt.toISOString(),
        });
      },
    },
  },
});
