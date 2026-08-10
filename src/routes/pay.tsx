import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ShieldCheck } from "lucide-react";
import { ZakaLogo } from "@/components/zaka-logo";
import { PaymentTunnel } from "@/components/payment-tunnel";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveAppByApiKey } from "@/lib/checkout.functions";

const searchSchema = z.object({
  api_key: z.string().trim().min(1).max(120).optional(),
  plan: z.enum(["mensuel", "annuel", "monthly", "yearly"]).optional(),
  user_id: z.string().trim().max(80).optional(),
});

export const Route = createFileRoute("/pay")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Paiement sécurisé Zaka — MonCash & Natcash" },
      {
        name: "description",
        content:
          "Page de paiement hébergée par Zaka : choisissez votre plan Pro et payez en gourdes via MonCash ou Natcash.",
      },
      { property: "og:title", content: "Paiement sécurisé Zaka" },
      {
        property: "og:description",
        content: "Tunnel de paiement Pro hébergé, activation automatique après confirmation SMS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PayPage,
});

function PayPage() {
  const { api_key: apiKey, user_id: userId, plan } = Route.useSearch();
  const defaultPlan = plan === "annuel" || plan === "yearly" ? "yearly" : "monthly";
  const resolve = useServerFn(resolveAppByApiKey);

  const { data, isLoading } = useQuery({
    queryKey: ["pay-app", apiKey],
    queryFn: () => resolve({ data: { apiKey: apiKey! } }),
    enabled: Boolean(apiKey),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <ZakaLogo markClassName="size-10" />
      {!apiKey && (
        <p className="text-sm text-destructive">
          Lien invalide : la clé API du développeur est manquante.
        </p>
      )}
      {apiKey && isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {apiKey && !isLoading && !data && (
        <p className="text-sm text-destructive">Clé API inconnue — contactez l'éditeur de l'application.</p>
      )}
      {data && (
        <>
          <h1 className="font-display text-3xl font-bold">Passer en Pro sur {data.name}</h1>
          <p className="text-sm text-muted-foreground">
            Paiement en gourdes via MonCash ou Natcash. Votre accès Pro est activé automatiquement
            dès la confirmation du transfert.
          </p>
          <PaymentTunnel appId={data.id} userId={userId ?? "web_user"} defaultPlan={defaultPlan} />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" /> Paiement hébergé et sécurisé par Zaka
          </p>
        </>
      )}
    </main>
  );
}
