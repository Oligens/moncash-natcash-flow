import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Clock, Plus, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ConsoleShell } from "@/components/console-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createApp, listMyApps } from "@/lib/developer.functions";
import { formatHTG } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Espace développeur — Zaka" },
      {
        name: "description",
        content:
          "Gérez vos applications connectées à Zaka, vos numéros MonCash/Natcash et vos abonnés Pro.",
      },
      { property: "og:title", content: "Espace développeur — Zaka" },
      {
        property: "og:description",
        content: "Suivez vos abonnés Pro, vos revenus en gourdes et vos paiements en attente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const queryClient = useQueryClient();
  const fetchApps = useServerFn(listMyApps);
  const addApp = useServerFn(createApp);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-apps"],
    queryFn: () => fetchApps(),
  });

  const mutation = useMutation({
    mutationFn: (value: string) => addApp({ data: { name: value } }),
    onSuccess: () => {
      toast.success("Application créée");
      setOpen(false);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["my-apps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ConsoleShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Vos applications</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Chaque application dispose de sa clé API, de ses numéros de réception et de son
            tableau de bord.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="size-4" /> Nouvelle application
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer une application</DialogTitle>
              <DialogDescription>
                Une clé API unique sera générée pour l'intégration du tunnel de paiement.
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="Nom de l'application"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <DialogFooter>
              <Button
                disabled={name.trim().length < 2 || mutation.isPending}
                onClick={() => mutation.mutate(name.trim())}
              >
                Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="mt-6 text-sm text-destructive">{(error as Error).message}</p>}

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}

        {data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucune application pour le moment — créez la première pour obtenir votre clé API.
          </p>
        )}

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
            <div className="mt-5 flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-[10px]">
                {app.api_key.slice(0, 14)}…
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px]"
                title="Statut du téléphone relais"
              >
                Relais{" "}
                {app.relay_last_seen_at &&
                Date.now() - new Date(app.relay_last_seen_at).getTime() < 600000
                  ? "connecté"
                  : "hors ligne"}
              </Badge>
            </div>
          </Link>
        ))}
      </div>
    </ConsoleShell>
  );
}
