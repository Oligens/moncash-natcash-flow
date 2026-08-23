import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { ZakaLogo } from "@/components/zaka-logo";
import { PaymentTunnel } from "@/components/payment-tunnel";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveAppByApiKey } from "@/lib/checkout.functions";
import { useState, useEffect } from "react";

const searchSchema = z.object({
  api_key: z.string().trim().min(1).max(120),
  plan: z.string().trim().min(1).max(80).optional(),
  user_id: z.string().trim().max(80).optional(),
});

type SearchParams = z.infer<typeof searchSchema>;

function normalizeSearchParams(search: unknown): SearchParams {
  const parsed = searchSchema.safeParse(search || {});
  if (!parsed.success) {
    console.error("[PayPage] Invalid payment URL:", parsed.error);
    return {} as SearchParams;
  }
  return {
    api_key: parsed.data.api_key,
    plan: parsed.data.plan?.trim().toLowerCase(),
    user_id: parsed.data.user_id,
  };
}

export const Route = createFileRoute("/pay")({
  validateSearch: normalizeSearchParams,
  head: () => ({
    meta: [
      { title: "Paiement sécurisé Zaka — MonCash & Natcash" },
      { name: "description", content: "Page de paiement hébergée par Zaka avec plans personnalisés." },
    ],
  }),
  component: PayPage,
});

function PayPage() {
  const search = Route.useSearch();
  const apiKey = search.api_key;
  const userId = search.user_id;
  const planKey = search.plan;
  const resolve = useServerFn(resolveAppByApiKey);
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["pay-app", apiKey],
    queryFn: async () => {
      try {
        const result = await resolve({ data: { apiKey } });
        setHasLoaded(true);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erreur lors de la vérification de la clé API";
        setLocalError(message);
        setHasLoaded(true);
        return null;
      }
    },
    enabled: Boolean(apiKey),
    retry: false,
  });

  useEffect(() => {
    if (error) console.error("[PayPage] React Query error:", error);
  }, [error]);

  if (!apiKey && hasLoaded) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <ZakaLogo markClassName="size-10" />
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
          <AlertTriangle className="size-10 text-destructive" />
          <h1 className="font-display text-xl font-bold">Lien invalide</h1>
          <p className="text-sm text-muted-foreground">Le paramètre api_key est obligatoire.</p>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <ZakaLogo markClassName="size-10" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <p className="text-sm text-muted-foreground">Chargement des informations de paiement...</p>
      </main>
    );
  }

  if (localError || !data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <ZakaLogo markClassName="size-10" />
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
          <AlertTriangle className="mx-auto mb-3 size-10 text-destructive" />
          <h1 className="font-display text-xl font-bold">Clé API invalide</h1>
          <p className="mt-2 text-sm text-muted-foreground">{localError || "Cette clé API n'est pas reconnue."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <ZakaLogo markClassName="size-10" />
      <h1 className="font-display text-3xl font-bold">Paiement sur {data.name}</h1>
      <p className="text-sm text-muted-foreground">
        {planKey ? `Plan sélectionné : ${planKey}` : "Sélectionnez votre plan."} Paiement via MonCash ou Natcash.
      </p>
      <PaymentTunnel appId={data.id} userId={userId ?? "web_user"} requestedPlan={planKey} plans={data.plans} />
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" /> Paiement hébergé et sécurisé par Zaka
      </p>
    </main>
  );
}
