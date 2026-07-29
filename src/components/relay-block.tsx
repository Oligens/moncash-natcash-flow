import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Copy,
  Download,
  ShieldCheck,
  Smartphone,
  WifiOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/qr-code";
import { ZakaMark } from "@/components/zaka-logo";
import { getRelayActivity } from "@/lib/developer.functions";
import { formatDate } from "@/lib/plans";

export function RelayBlock({
  appId,
  appName,
  apiKey,
  apkUrl,
}: {
  appId: string;
  appName: string;
  apiKey: string;
  apkUrl?: string | null;
}) {
  const fetchActivity = useServerFn(getRelayActivity);
  const { data } = useQuery({
    queryKey: ["relay", appId],
    queryFn: () => fetchActivity({ data: { appId } }),
    refetchInterval: 15000,
  });
  const [showKey, setShowKey] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = `${origin}/api/public/webhook/sms`;
  const pairingPayload = JSON.stringify({
    v: 1,
    app: appName,
    api_key: apiKey,
    webhook: webhookUrl,
    ping: `${origin}/api/public/v1/relay/ping`,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Téléchargement */}
      <section className="card-elevated surface-hero lg:col-span-3 rounded-2xl border border-border bg-card p-7">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-border bg-background/60 p-2">
            <ZakaMark className="size-12" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">Passerelle SMS Zaka Relay</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Cette application est le cœur de votre automatisation. Installez-la{" "}
              <strong className="text-foreground">UNIQUEMENT</strong> sur le téléphone Android qui
              contient votre carte SIM MonCash ou Natcash de réception. Elle écoute les
              confirmations de paiement et les transmet instantanément à votre API via Webhook.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="gap-2"
            onClick={() => {
              if (apkUrl) window.open(apkUrl, "_blank", "noopener");
              else toast.info("L'APK sera disponible dès sa publication par l'administrateur Zaka.");
            }}
          >
            <Download className="size-4" /> Télécharger l'APK (v1.0)
          </Button>
          <Badge variant="secondary" className="gap-1.5 py-1.5">
            <ShieldCheck className="size-3.5 text-primary" /> Requis pour l'activation instantanée.
          </Badge>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
          <div className="text-xs tracking-wide text-muted-foreground uppercase">
            Webhook cible (configuré automatiquement au scan)
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate font-mono text-xs">{webhookUrl}</code>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(webhookUrl);
                toast.success("Webhook copié");
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Association */}
      <section className="lg:col-span-2 rounded-2xl border border-border bg-card p-7">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Smartphone className="size-4 text-primary" /> Association du Relais
        </h3>

        <div className="mt-5 flex flex-col items-center gap-4">
          <QrCode value={pairingPayload} size={168} />
          <ol className="space-y-1.5 text-xs text-muted-foreground">
            <li>1. Ouvrez l'application Zaka Relay sur le téléphone SIM.</li>
            <li>2. Touchez « Associer un compte » puis scannez ce QR code.</li>
            <li>3. Autorisez la lecture des SMS et laissez l'app en arrière-plan.</li>
          </ol>
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-4"
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? "Masquer la clé" : "Association manuelle (afficher la clé)"}
          </button>
          {showKey && (
            <code className="w-full rounded-lg bg-muted/40 p-2 text-center font-mono text-[10px] break-all">
              {apiKey}
            </code>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`size-2.5 rounded-full ${data?.online ? "bg-primary animate-pulse" : "bg-muted-foreground"}`}
            />
            <span className="font-medium">
              Statut du téléphone relais :{" "}
              {data?.online ? "Connecté" : "En attente de connexion…"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Dernier signal : {formatDate(data?.lastSeen ?? null)}
          </p>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold">Journal des transferts</h4>
          <div className="mt-3 space-y-2">
            {(data?.logs ?? []).length === 0 && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <WifiOff className="size-3.5" /> Aucun transfert reçu pour le moment.
              </p>
            )}
            {(data?.logs ?? []).slice(0, 6).map((log) => (
              <div key={log.id} className="rounded-lg border border-border/70 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    {log.status === "success" ? (
                      <CheckCircle2 className="size-3.5 text-primary" />
                    ) : (
                      <XCircle className="size-3.5 text-destructive" />
                    )}
                    {log.detail ?? log.status}
                  </span>
                  <span className="text-muted-foreground">{formatDate(log.created_at)}</span>
                </div>
                <p className="mt-1 truncate text-muted-foreground">{log.raw_content}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
