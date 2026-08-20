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

// Schema de validation flexible et robuste pour les paramètres de requête
const searchSchema = z.object({
  // Accepte apikey, api_key, key pour plus de flexibilité
  apikey: z.string().trim().min(1).max(120).optional(),
  api_key: z.string().trim().min(1).max(120).optional(),
  key: z.string().trim().min(1).max(120).optional(),
  // Plan flexible avec normalisation
  plan: z.string().trim().toLowerCase().optional(),
  user_id: z.string().trim().max(80).optional(),
});

// Type dérivé du schema
type SearchParams = z.infer<typeof searchSchema>;

// Fonction de normalisation des paramètres
function normalizeSearchParams(search: unknown): SearchParams {
  try {
    const parsed = searchSchema.parse(search || {});
    // Priorité: apikey > api_key > key
    const apiKey = parsed.apikey || parsed.api_key || parsed.key;
    // Normalisation du plan
    const rawPlan = parsed.plan || "";
    let normalizedPlan: "mensuel" | "annuel" | "monthly" | "yearly" | undefined;
    if (rawPlan) {
      const p = rawPlan.toLowerCase();
      if (["mensuel", "monthly"].includes(p)) normalizedPlan = "monthly";
      else if (["annuel", "yearly"].includes(p)) normalizedPlan = "yearly";
    }
    return {
      apikey: apiKey,
      api_key: apiKey,
      key: apiKey,
      plan: normalizedPlan,
      user_id: parsed.user_id,
    };
  } catch (error) {
    console.error("[PayPage] Erreur de validation des paramètres:", error);
    return { apikey: undefined, api_key: undefined, key: undefined, plan: undefined, user_id: undefined };
  }
}

export const Route = createFileRoute("/pay")({
  validateSearch: (search) => {
    try {
      return normalizeSearchParams(search);
    } catch (error) {
      console.error("[PayPage] validateSearch error:", error);
      return { apikey: undefined, api_key: undefined, key: undefined, plan: undefined, user_id: undefined };
    }
  },
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
  const search = Route.useSearch();
  // Récupération flexible de l'apiKey
  const apiKey = search.apikey || search.api_key || search.key;
  const userId = search.user_id;
  const rawPlan = search.plan;
  
  const defaultPlan = rawPlan === "yearly" ? "yearly" : "monthly";
  const resolve = useServerFn(resolveAppByApiKey);
  
  // État local pour gérer les erreurs de manière isolée
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["pay-app", apiKey],
    queryFn: async () => {
      try {
        if (!apiKey) {
          throw new Error("Clé API manquante");
        }
        const result = await resolve({ data: { apiKey } });
        setHasLoaded(true);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Erreur lors de la vérification de la clé API";
        console.error("[PayPage] Query error:", err);
        setLocalError(errorMessage);
        setHasLoaded(true);
        return null;
      }
    },
    enabled: Boolean(apiKey),
    retry: false, // Ne pas réessayer automatiquement en cas d'échec
  });

  // Effet pour logger les erreurs côté client
  useEffect(() => {
    if (error) {
      console.error("[PayPage] React Query error:", error);
    }
  }, [error]);

  // Rendu d'erreur globale si nécessaire
  if (!apiKey && hasLoaded) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <ZakaLogo markClassName="size-10" />
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
          <AlertTriangle className="size-10 text-destructive" />
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Lien invalide</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              La clé API du développeur est manquante ou invalide dans l'URL.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Exemple d'URL correcte : <code className="bg-muted px-2 py-1 rounded">/pay?apikey=sk_live_...&amp;plan=monthly</code>
            </p>
          </div>
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
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
          <AlertTriangle className="size-10 text-destructive" />
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              {localError?.includes("manquante") ? "Clé API manquante" : "Clé API invalide"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {localError || "Cette clé API n'est pas reconnue. Contactez l'éditeur de l'application."}
            </p>
            {localError && (
              <p className="mt-2 text-xs text-muted-foreground">
                Détails techniques (console): voir les logs navigateur
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <ZakaLogo markClassName="size-10" />
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
    </main>
  );
}
