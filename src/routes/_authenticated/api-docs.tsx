import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { ConsoleShell } from "@/components/console-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listMyApps } from "@/lib/developer.functions";

export const Route = createFileRoute("/_authenticated/api-docs")({
  head: () => ({
    meta: [
      { title: "Paramètres API — Console Zaka" },
      {
        name: "description",
        content:
          "Clés API, webhook SMS et endpoint de vérification de licence pour brancher une nouvelle application.",
      },
      { property: "og:title", content: "Paramètres API — Console Zaka" },
      {
        property: "og:description",
        content: "Documentation des endpoints REST d'abonnement MonCash et Natcash.",
      },
    ],
  }),
  component: ApiSettings,
});

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-2 flex items-center gap-3">
        <code className="flex-1 truncate font-mono text-sm">{value}</code>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success("Copié");
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="font-semibold">{title}</h3>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/40 p-4 font-mono text-xs whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function ApiSettings() {
  const fetchApps = useServerFn(listMyApps);
  const { data, isLoading } = useQuery({ queryKey: ["apps"], queryFn: () => fetchApps() });
  const origin = typeof window !== "undefined" ? window.location.origin : "https://votre-app";

  return (
    <ConsoleShell>
      <h1 className="text-3xl font-bold">Paramètres de l'API</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Toutes les requêtes tierces et le téléphone relais SMS doivent envoyer l'en-tête{" "}
        <code className="font-mono text-accent">x-api-key</code>.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold">Endpoints REST</h2>
        <CopyRow label="Webhook SMS (POST)" value={`${origin}/api/public/webhook/sms`} />
        <CopyRow label="Initier un paiement (POST)" value={`${origin}/api/public/v1/checkout/init`} />
        <CopyRow
          label="Vérifier une licence (GET)"
          value={`${origin}/api/public/v1/license/verify?user_id=USER_ID`}
        />
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="size-4 text-primary" /> Clés API par application
        </h2>
        {isLoading && <Skeleton className="h-24 rounded-xl" />}
        {data?.map((app) => <CopyRow key={app.id} label={app.name} value={app.api_key} />)}
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-3">
        <Snippet
          title="1. Initier un paiement"
          code={`curl -X POST ${origin}/api/public/v1/checkout/init \\
  -H "x-api-key: VOTRE_CLE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "user_id": "user_123",
    "account_name": "Jean Baptiste",
    "user_phone": "50937112233",
    "provider": "moncash",
    "plan_type": "monthly"
  }'`}
        />
        <Snippet
          title="2. Webhook SMS (téléphone relais)"
          code={`curl -X POST ${origin}/api/public/webhook/sms \\
  -H "x-api-key: VOTRE_CLE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Ou resevwa 250.00 HTG de Jean Baptiste 50937112233",
    "sender": "50937112233"
  }'`}
        />
        <Snippet
          title="3. Vérifier la licence"
          code={`curl "${origin}/api/public/v1/license/verify?user_id=user_123" \\
  -H "x-api-key: VOTRE_CLE"

# { "active": true, "plan_type": "monthly", "expires_at": "..." }`}
        />
      </section>
    </ConsoleShell>
  );
}
