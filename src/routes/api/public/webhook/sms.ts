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

type AppConfig = {
  id: string;
  sender_whitelist: string[] | null;
  amount_regex: string | null;
  name_regex: string | null;
  reference_regex: string | null;
  strict_name_match: boolean | null;
};

export const Route = createFileRoute("/api/public/webhook/sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey) return json({ error: "Clé API manquante (x-api-key)" }, 401);

        const { requireActiveApiApp } = await import("@/lib/api-access");
        const access = await requireActiveApiApp(apiKey);
        if (!access.app) return json({ error: access.error }, access.status);
        const app = access.app as AppConfig & { id: string };
        const { db } = await import("@/lib/db.server");
        const sql = db();

        // Toute requête authentifiée maintient le statut « en ligne » du relais.
        await sql`UPDATE apps SET relay_last_seen_at = now() WHERE id = ${app.id}`;

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Corps de requête invalide" }, 400);

        const message = parsed.data.message;
        const sender = parsed.data.sender ?? null;

        const logRelay = (status: string, detail: string) =>
          sql`INSERT INTO relay_logs (app_id, raw_content, sender, status, detail)
              VALUES (${app.id}, ${message}, ${sender}, ${status}, ${detail})`;

        const logSms = (fields: {
          status: string;
          reason?: string | null;
          amount_detected?: number | null;
          sender_name?: string | null;
          reference?: string | null;
          matched_subscription_id?: string | null;
        }) =>
          sql`INSERT INTO sms_logs (app_id, raw_content, sender_phone, status, reason, amount_detected, sender_name, reference, matched_subscription_id)
              VALUES (${app.id}, ${message}, ${sender}, ${fields.status}, ${fields.reason ?? null},
                      ${fields.amount_detected ?? null}, ${fields.sender_name ?? null},
                      ${fields.reference ?? null}, ${fields.matched_subscription_id ?? null})`;

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
            logSms({
              status: "unmatched",
              reason: "Montant non détecté",
              sender_name: name,
              reference,
            }),
          ]);
          return json({ matched: false, reason: "Montant non détecté" }, 200);
        }

        // 3. Validation croisée : montant du plan + nom du compte émetteur
        const candidates = (await sql`
          SELECT id, account_name, user_phone, plan_type, amount FROM subscriptions
          WHERE app_id = ${app.id} AND status = 'pending' AND amount = ${amount}
          ORDER BY created_at ASC
        `) as {
          id: string;
          account_name: string;
          user_phone: string | null;
          plan_type: string;
          amount: string;
        }[];

        const list = candidates;
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
        if (!match && !strict && list.length === 1) match = list[0]!;

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

        await sql`
          UPDATE subscriptions
          SET status = 'active', expires_at = ${expiresAt.toISOString()}, reference = ${reference},
              user_phone = coalesce(${senderPhone}, user_phone)
          WHERE id = ${match.id}
        `;

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
