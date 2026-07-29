import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ConsoleShell } from "@/components/console-shell";
import { RelayBlock } from "@/components/relay-block";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { listMyApps } from "@/lib/developer.functions";
import { getPlatformSettings } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/relay")({
  head: () => ({
    meta: [
      { title: "Passerelle SMS Zaka Relay — association du téléphone" },
      {
        name: "description",
        content:
          "Téléchargez l'application relais Zaka, associez votre téléphone SIM MonCash/Natcash et suivez les transferts SMS en temps réel.",
      },
      { property: "og:title", content: "Passerelle SMS Zaka Relay" },
      {
        property: "og:description",
        content: "Association par QR code et journal des transferts SMS de votre téléphone relais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RelayPage,
});

function RelayPage() {
  const fetchApps = useServerFn(listMyApps);
  const fetchSettings = useServerFn(getPlatformSettings);
  const { data: apps, isLoading } = useQuery({ queryKey: ["my-apps"], queryFn: () => fetchApps() });
  const { data: settings } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => fetchSettings(),
  });
  const [selected, setSelected] = useState<string | null>(null);

  const current = apps?.find((a) => a.id === selected) ?? apps?.[0] ?? null;

  return (
    <ConsoleShell>
      <h1 className="font-display text-3xl font-bold">Passerelle SMS</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Le téléphone relais transforme les SMS de confirmation en activations instantanées.
      </p>

      {isLoading && <Skeleton className="mt-8 h-72 rounded-2xl" />}

      {apps && apps.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {apps.map((app) => (
            <Button
              key={app.id}
              size="sm"
              variant={current?.id === app.id ? "default" : "outline"}
              onClick={() => setSelected(app.id)}
            >
              {app.name}
            </Button>
          ))}
        </div>
      )}

      {apps?.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">
          Créez d'abord une application pour obtenir une clé d'association.
        </p>
      )}

      {current && (
        <div className="mt-8">
          <RelayBlock
            appId={current.id}
            appName={current.name}
            apiKey={current.api_key}
            apkUrl={settings?.relay_apk_url}
          />
        </div>
      )}
    </ConsoleShell>
  );
}
