import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Clock, Percent, TrendingUp, Users, Wallet } from "lucide-react";
import { ConsoleShell } from "@/components/console-shell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAppOverview } from "@/lib/dashboard.functions";
import { formatDate, formatHTG } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/apps/$appId")({
  head: () => ({
    meta: [
      { title: "Tableau de bord de l'application — Kès Pro" },
      {
        name: "description",
        content:
          "KPIs, évolution des revenus et historique des transactions MonCash/Natcash de l'application.",
      },
      { property: "og:title", content: "Tableau de bord de l'application — Kès Pro" },
      {
        property: "og:description",
        content: "Analytique détaillée des abonnements Pro d'une application connectée.",
      },
    ],
  }),
  component: AppDashboard,
});

const STATUS_STYLE: Record<string, string> = {
  active: "bg-primary/15 text-primary",
  pending: "bg-accent/15 text-accent",
  expired: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Validé",
  pending: "En attente",
  expired: "Expiré",
};

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="card-elevated rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
        <Icon className="size-4 text-primary" />
      </div>
      <div className="mt-3 font-display text-2xl font-bold">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function AppDashboard() {
  const { appId } = Route.useParams();
  const fetchOverview = useServerFn(getAppOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["app-overview", appId],
    queryFn: () => fetchOverview({ data: { appId } }),
    refetchInterval: 15000,
  });

  return (
    <ConsoleShell>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Toutes les applications
      </Link>

      {error && <p className="mt-6 text-sm text-destructive">{(error as Error).message}</p>}
      {isLoading && <Skeleton className="mt-6 h-96 rounded-2xl" />}

      {data && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">{data.app.name}</h1>
              <p className="font-mono text-xs text-muted-foreground">
                {data.app.slug} · {data.app.id}
              </p>
            </div>
            <Badge variant="secondary" className="font-mono text-[11px]">
              {data.app.api_key}
            </Badge>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={Users}
              label="Abonnés Pro actifs"
              value={String(data.kpis.activeCount)}
              hint={`${data.kpis.total} demandes au total`}
            />
            <Kpi
              icon={Wallet}
              label="Montant encaissé"
              value={formatHTG(data.kpis.revenue)}
              hint="Abonnements validés"
            />
            <Kpi
              icon={Percent}
              label="Taux de conversion"
              value={`${data.kpis.conversion} %`}
              hint="Tunnel initié → validé"
            />
            <Kpi
              icon={Clock}
              label="Expirent bientôt"
              value={String(data.kpis.expiringSoon)}
              hint="Dans les 7 prochains jours"
            />
          </div>

          <div className="card-elevated mt-8 rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <TrendingUp className="size-4 text-primary" /> Évolution sur 6 mois
                </h2>
                <p className="text-xs text-muted-foreground">
                  Revenus encaissés et nombre de souscriptions.
                </p>
              </div>
            </div>

            <Tabs defaultValue="revenus" className="mt-5">
              <TabsList>
                <TabsTrigger value="revenus">Revenus (HTG)</TabsTrigger>
                <TabsTrigger value="souscriptions">Souscriptions</TabsTrigger>
              </TabsList>

              <TabsContent value="revenus" className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.chart}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                    <RTooltip
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                        color: "var(--color-popover-foreground)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenus"
                      stroke="var(--color-chart-1)"
                      fill="url(#rev)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </TabsContent>

              <TabsContent value="souscriptions" className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.chart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
                    <RTooltip
                      cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                        color: "var(--color-popover-foreground)",
                      }}
                    />
                    <Bar dataKey="souscriptions" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>
            </Tabs>
          </div>

          <div className="card-elevated mt-8 overflow-x-auto rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Transactions récentes</h2>
            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Moyen</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.account_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{t.user_id}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.user_phone ?? "—"}</TableCell>
                    <TableCell>
                      <span
                        className={
                          t.provider === "moncash"
                            ? "text-moncash font-medium"
                            : "text-natcash font-medium"
                        }
                      >
                        {t.provider === "moncash" ? "MonCash" : "Natcash"}
                      </span>
                    </TableCell>
                    <TableCell>{formatHTG(Number(t.amount))}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[t.status] ?? ""}`}
                      >
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(t.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
                {data.transactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Aucune transaction pour le moment.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </ConsoleShell>
  );
}
