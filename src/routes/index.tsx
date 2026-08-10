import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  KeyRound,
  MessageSquareText,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaymentTunnel } from "@/components/payment-tunnel";
import { listPublicApps } from "@/lib/checkout.functions";
import { PLANS, formatHTG } from "@/lib/plans";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zaka — Abonnements Pro via MonCash & Natcash" },
      {
        name: "description",
        content:
          "Tunnel de paiement, validation automatique par SMS et tableaux de bord multi-applications pour vos abonnements Pro en gourdes.",
      },
      { property: "og:title", content: "Zaka — Abonnements Pro via MonCash & Natcash" },
      {
        property: "og:description",
        content:
          "Encaissez vos abonnements Pro en gourdes et activez les licences automatiquement dès réception du SMS.",
      },
    ],
  }),
  loader: () => listPublicApps(),
  component: Landing,
});

const FEATURES = [
  {
    icon: MessageSquareText,
    title: "Validation SMS automatique",
    text: "Le téléphone relais envoie le SMS au webhook : montant et nom sont analysés puis rapprochés de l'abonnement en attente.",
  },
  {
    icon: BarChart3,
    title: "Analytique multi-tenant",
    text: "Chaque application connectée dispose de ses KPIs, de sa courbe de revenus et de son historique de transactions.",
  },
  {
    icon: KeyRound,
    title: "API prête à brancher",
    text: "Clé x-api-key, initialisation de paiement et vérification de licence en un appel REST.",
  },
];

function Landing() {
  const apps: { id: string; name: string; slug: string }[] = Route.useLoaderData();
  const demoAppId = apps[0]?.id;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link to="/" aria-label="Accueil Zaka">
            <ZakaLogo markClassName="size-9 sm:size-10" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/api-docs">API</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard">Tableau de bord</Link>
            </Button>
          </div>
        </nav>
      </header>

      <section className="surface-hero">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Badge variant="secondary" className="mb-5 gap-1">
            <Zap className="size-3.5 text-accent" /> Paiements mobiles haïtiens
          </Badge>
          <h1 className="max-w-3xl text-5xl leading-tight font-bold sm:text-6xl">
            Gérez tous vos <span className="text-gradient">abonnements Pro</span> payés par MonCash
            et Natcash.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Un tunnel de paiement réutilisable pour toutes vos applications, une activation
            automatique dès réception du SMS de confirmation, et une console analytique centralisée.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {demoAppId && <PaymentTunnel appId={demoAppId} />}
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link to="/dashboard">
                Voir la console <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" />
            {Object.values(PLANS)
              .map((p) => `${p.label} ${formatHTG(p.amount)}`)
              .join(" · ")}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-bold">Une infrastructure complète</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="card-elevated rounded-2xl border border-border bg-card p-6"
            >
              <f.icon className="size-6 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="text-3xl font-bold">Applications connectées</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Chaque application utilise le même tunnel et sa propre clé API.
        </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {apps.map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-5"
              >
                <div>
                  <div className="font-semibold">{app.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{app.slug}</div>
                </div>
                <PaymentTunnel appId={app.id} triggerLabel="Tester le tunnel" />
              </div>
            ))}
          </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        Zaka — abonnements Pro en gourdes, activés automatiquement.
      </footer>
    </div>
  );
}
