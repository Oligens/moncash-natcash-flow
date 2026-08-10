import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Copy, KeyRound, RefreshCw, TrendingUp, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ConsoleShell } from "@/components/console-shell";
import { RelayBlock } from "@/components/relay-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAppOverview,
  regenerateApiKey,
  updateAppSettings,
} from "@/lib/developer.functions";
import { getPlatformSettings } from "@/lib/admin.functions";
import { formatDate, formatHTG } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/apps/$appId")({
  head: () => ({
    meta: [
      { title: "Tableau de bord de l'application — Zaka" },
      {
        name: "description",
        content:
          "Statistiques, transactions MonCash/Natcash, passerelle SMS et règles de matching de votre application Zaka.",
      },
      { property: "og:title", content: "Tableau de bord de l'application — Zaka" },
      {
        property: "og:description",
        content: "KPIs, revenus en gourdes et paramètres avancés du relais SMS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppDetailPage,
});

function AppDetailPage() {
  const { appId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getAppOverview);
  const fetchSettings = useServerFn(getPlatformSettings);
  const saveSettings = useServerFn(updateAppSettings);
  const rotateKey = useServerFn(regenerateApiKey);

  const { data, isLoading, error } = useQuery({
    queryKey: ["app", appId],
    queryFn: () => fetchOverview({ data: { appId } }),
  });
  const { data: platform } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => fetchSettings(),
  });

  const [form, setForm] = useState({
    name: "",
    moncashNumber: "",
    natcashNumber: "",
    qrImageUrl: "",
    whitelist: "",
    amountRegex: "",
    nameRegex: "",
    referenceRegex: "",
    strictNameMatch: true,
  });

  useEffect(() => {
    if (!data?.app) return;
    const a = data.app;
    setForm({
      name: a.name,
      moncashNumber: a.moncash_number ?? "",
      natcashNumber: a.natcash_number ?? "",
      qrImageUrl: a.qr_image_url ?? "",
      whitelist: (a.sender_whitelist ?? []).join(", "),
      amountRegex: a.amount_regex ?? "",
      nameRegex: a.name_regex ?? "",
      referenceRegex: a.reference_regex ?? "",
      strictNameMatch: a.strict_name_match ?? true,
    });
  }, [data?.app]);

  const settingsMutation = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          appId,
          name: form.name,
          moncashNumber: form.moncashNumber || null,
          natcashNumber: form.natcashNumber || null,
          qrImageUrl: form.qrImageUrl || null,
          senderWhitelist: form.whitelist
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          amountRegex: form.amountRegex,
          nameRegex: form.nameRegex,
          referenceRegex: form.referenceRegex,
          strictNameMatch: form.strictNameMatch,
        },
      }),
    onSuccess: () => {
      toast.success("Paramètres enregistrés");
      queryClient.invalidateQueries({ queryKey: ["app", appId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const keyMutation = useMutation({
    mutationFn: () => rotateKey({ data: { appId } }),
    onSuccess: () => {
      toast.success("Nouvelle clé API générée");
      queryClient.invalidateQueries({ queryKey: ["app", appId] });
      queryClient.invalidateQueries({ queryKey: ["my-apps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <ConsoleShell>
        <Skeleton className="h-72 rounded-2xl" />
      </ConsoleShell>
    );
  }
  if (error || !data) {
    return (
      <ConsoleShell>
        <p className="text-sm text-destructive">{(error as Error)?.message ?? "Introuvable"}</p>
      </ConsoleShell>
    );
  }

  const { app, kpis, chart, transactions } = data;

  return (
    <ConsoleShell>
      <Button asChild variant="ghost" size="sm" className="gap-2">
        <Link to="/dashboard">
          <ArrowLeft className="size-4" /> Applications
        </Link>
      </Button>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{app.name}</h1>
          <p className="font-mono text-xs text-muted-foreground">{app.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 font-mono text-[10px]">
            <KeyRound className="size-3" /> {app.api_key.slice(0, 18)}…
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(app.api_key);
              toast.success("Clé API copiée");
            }}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={keyMutation.isPending}
            onClick={() => keyMutation.mutate()}
          >
            <RefreshCw className="size-4" /> Régénérer
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="relay">Relais SMS</TabsTrigger>
          <TabsTrigger value="settings">Paramètres avancés</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Abonnés Pro actifs", value: kpis.activeCount, icon: Users },
              { label: "Total encaissé", value: formatHTG(kpis.revenue), icon: Wallet },
              { label: "Taux de conversion", value: `${kpis.conversion} %`, icon: TrendingUp },
              { label: "Expirent sous 7 jours", value: kpis.expiringSoon, icon: RefreshCw },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="card-elevated rounded-2xl border border-border bg-card p-5"
              >
                <kpi.icon className="size-4 text-primary" />
                <div className="mt-3 text-2xl font-bold">{kpi.value}</div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Revenus & souscriptions</h2>
            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="revenus"
                    stroke="hsl(var(--primary))"
                    fill="url(#rev)"
                  />
                  <Area
                    type="monotone"
                    dataKey="souscriptions"
                    stroke="hsl(var(--accent))"
                    fillOpacity={0}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Moyen</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.account_name}</div>
                      <div className="text-xs text-muted-foreground">{t.user_id}</div>
                    </TableCell>
                    <TableCell>{t.user_phone ?? "—"}</TableCell>
                    <TableCell className="capitalize">{t.provider}</TableCell>
                    <TableCell>{formatHTG(Number(t.amount))}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === "active" ? "default" : "secondary"}>
                        {t.status === "active"
                          ? "Validé"
                          : t.status === "expired"
                            ? "Expiré"
                            : "En attente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{formatDate(t.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="relay" className="mt-6">
          <RelayBlock
            appId={appId}
            appName={app.name}
            apiKey={app.api_key}
            apkUrl={platform?.relay_apk_url}
          />
        </TabsContent>

        <TabsContent value="config" className="mt-6">
          <div className="grid max-w-4xl gap-6">
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Moyens de paiement</h2>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-4 cursor-help text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Ces numéros sont affichés à vos utilisateurs pendant le tunnel de paiement
                      Zaka.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nom de l'application</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL du QR code de réception</Label>
                  <Input
                    value={form.qrImageUrl}
                    placeholder="https://…/qr-moncash.png"
                    onChange={(e) => setForm({ ...form, qrImageUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Numéro MonCash</Label>
                  <Input
                    value={form.moncashNumber}
                    placeholder="+509 …"
                    onChange={(e) => setForm({ ...form, moncashNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Numéro Natcash</Label>
                  <Input
                    value={form.natcashNumber}
                    placeholder="+509 …"
                    onChange={(e) => setForm({ ...form, natcashNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-5">
                <Button
                  disabled={settingsMutation.isPending}
                  onClick={() => settingsMutation.mutate()}
                >
                  Enregistrer mes numéros
                </Button>
              </div>
              <Callout title="Étape 1 — Configuration initiale">
                Configurez vos numéros de réception ci-dessus. Zaka affichera ces numéros à vos
                utilisateurs lorsqu'ils choisiront de passer en mode Pro.
              </Callout>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="api" className="mt-6">
          <div className="grid max-w-4xl gap-6">
            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold">Clé API (x-api-key)</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Gardez-la secrète. En cas de compromission, régénérez-la : l'ancienne clé cesse
                immédiatement de fonctionner.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-xl border border-border bg-muted/40 px-4 py-3 font-mono text-xs">
                  {showKey ? app.api_key : `${app.api_key.slice(0, 12)}${"•".repeat(18)}`}
                </code>
                <Button size="sm" variant="outline" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button size="sm" variant="outline" onClick={() => copy(app.api_key, "Clé API copiée")}>
                  <Copy className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={keyMutation.isPending}
                  onClick={() => keyMutation.mutate()}
                >
                  <RefreshCw className="size-4" /> Régénérer ma clé
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2">
                <LinkIcon className="size-4 text-primary" />
                <h2 className="text-lg font-semibold">Générateur d'URL de paiement</h2>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Plan proposé</Label>
                  <Select value={linkPlan} onValueChange={(v) => setLinkPlan(v as LinkPlan)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mensuel">Mensuel</SelectItem>
                      <SelectItem value="annuel">Annuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Identifiant utilisateur (optionnel)</Label>
                  <Input
                    value={linkUser}
                    placeholder="user_123"
                    onChange={(e) => setLinkUser(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-xl border border-border bg-muted/40 px-4 py-3 font-mono text-xs">
                  {payUrl}
                </code>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => copy(payUrl, "Lien de paiement copié")}
                >
                  <Copy className="size-4" /> Copier le lien
                </Button>
              </div>
              <Callout title="Étape 2 — Le bouton « Passer en Pro »">
                Insérez un bouton dans votre application. Au clic, redirigez simplement
                l'utilisateur vers cette URL. Zaka se charge de tout le processus de paiement
                (choix du plan, MonCash/Natcash, confirmation SMS).
              </Callout>
              <Callout title="Étape 3 — Validation du paiement">
                Une fois le paiement validé, l'abonnement passe en <code>active</code>. Votre
                serveur peut le vérifier à tout moment via{" "}
                <code>GET /api/public/v1/license/verify?user_id=…</code> avec votre en-tête{" "}
                <code>x-api-key</code>.
              </Callout>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <div className="grid max-w-4xl gap-6">


            <section className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold">Filtrage & parsing intelligent</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Seuls les SMS des expéditeurs officiels sont traités. Le joker <code>*</code> est
                accepté dans les masques.
              </p>
              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label>Whitelist des expéditeurs (séparés par des virgules)</Label>
                  <Input
                    value={form.whitelist}
                    placeholder="MonCash, Digicel, Natcash, Natcom"
                    onChange={(e) => setForm({ ...form, whitelist: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Regex montant (HTG)</Label>
                  <Input
                    className="font-mono text-xs"
                    value={form.amountRegex}
                    onChange={(e) => setForm({ ...form, amountRegex: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Regex nom du compte émetteur</Label>
                  <Input
                    className="font-mono text-xs"
                    value={form.nameRegex}
                    onChange={(e) => setForm({ ...form, nameRegex: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Regex référence de transaction</Label>
                  <Input
                    className="font-mono text-xs"
                    value={form.referenceRegex}
                    onChange={(e) => setForm({ ...form, referenceRegex: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border p-4">
                  <div>
                    <div className="text-sm font-medium">Rapprochement strict du nom</div>
                    <p className="text-xs text-muted-foreground">
                      Le nom émetteur du SMS doit correspondre exactement au nom saisi dans le
                      tunnel de paiement.
                    </p>
                  </div>
                  <Switch
                    checked={form.strictNameMatch}
                    onCheckedChange={(v) => setForm({ ...form, strictNameMatch: v })}
                  />
                </div>
              </div>
            </section>

            <div>
              <Button disabled={settingsMutation.isPending} onClick={() => settingsMutation.mutate()}>
                Enregistrer les paramètres
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </ConsoleShell>
  );
}
