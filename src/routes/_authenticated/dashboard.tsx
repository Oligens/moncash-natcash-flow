import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Clock, Users, Wallet } from "lucide-react";
import { ConsoleShell } from "@/components/console-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { listApps } from "@/lib/dashboard.functions";
import { formatHTG } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Applications connectées — Console Kès Pro" },
      {
        name: "description",
        content: "Vue globale de toutes les applications connectées et de leurs abonnements Pro.",
      },
      { property: "og:title", content: "Applications connectées — Console Kès Pro" },
      { property: "og:description", content: "Suivez vos abonnés Pro, vos revenus en gourdes et vos paiements en attente." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchApps = useServerFn(listApps);
  const { data, isLoading, error } = useQuery({
    queryKey: ["apps"],
    queryFn: () => fetchApps(),
  });

  return (
    <ConsoleShell>
      <h1 className="text-3xl font-bold">Applications connectées</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sélectionnez une application pour ouvrir son tableau de bord analytique.
      </p>

      {error && <p className="mt-6 text-sm text-destructive">{(error as Error).message}</p>}

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {isLoading &&
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}

        {data?.map((app) => (
          <Link
            key={app.id}
            to="/apps/$appId"
            params={{ appId: app.id }}
            className="card-elevated group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/60"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{app.name}</h2>
                <p className="font-mono text-xs text-muted-foreground">{app.slug}</p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
              <div>
                <Users className="mb-1 size-4 text-primary" />
                <div className="font-semibold">{app.activeCount}</div>
                <div className="text-xs text-muted-foreground">Pro actifs</div>
              </div>
              <div>
                <Wallet className="mb-1 size-4 text-accent" />
                <div className="font-semibold">{formatHTG(app.revenue)}</div>
                <div className="text-xs text-muted-foreground">Encaissé</div>
              </div>
              <div>
                <Clock className="mb-1 size-4 text-muted-foreground" />
                <div className="font-semibold">{app.pendingCount}</div>
                <div className="text-xs text-muted-foreground">En attente</div>
              </div>
            </div>
            <Badge variant="secondary" className="mt-5 font-mono text-[10px]">
              {app.api_key.slice(0, 14)}…
            </Badge>
          </Link>
        ))}
      </div>
    </ConsoleShell>
  );
}
