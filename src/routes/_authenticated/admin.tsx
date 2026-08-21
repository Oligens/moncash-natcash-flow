import { createFileRoute, notFound } from "@tanstack/react-router";
import { isAdminUnlocked } from "@/lib/admin-gate";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ReceiptText, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ConsoleShell } from "@/components/console-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  createInvoice,
  createPromoCode,
  getAdminOverview,
  getPlatformSettings,
  listDeveloperSubscriptions,
  listPromoCodes,
  setPromoCodeActive,
  setExchangeRate,
  setDeveloperAccess,
  setInvoiceStatus,
  updatePlatformSettings,
} from "@/lib/admin.functions";
import { formatDate, formatHTG } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: () => {
    if (!isAdminUnlocked()) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Administration de la plateforme Zaka" },
      {
        name: "description",
        content:
          "Paramètres globaux Zaka, suivi des développeurs et facturation des abonnements SaaS de la plateforme.",
      },
      { property: "og:title", content: "Administration de la plateforme Zaka" },
      {
        property: "og:description",
        content: "Configurez les tarifs SaaS, l'APK relais et facturez vos développeurs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

export function AdminPage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getAdminOverview);
  const fetchSettings = useServerFn(getPlatformSettings);
  const saveSettings = useServerFn(updatePlatformSettings);
  const addInvoice = useServerFn(createInvoice);
  const updateInvoice = useServerFn(setInvoiceStatus);
  const fetchDeveloperSubscriptions = useServerFn(listDeveloperSubscriptions);
  const fetchPromoCodes = useServerFn(listPromoCodes);
  const addPromoCode = useServerFn(createPromoCode);
  const togglePromoCode = useServerFn(setPromoCodeActive);
  const saveExchangeRate = useServerFn(setExchangeRate);
  const updateDeveloperAccess = useServerFn(setDeveloperAccess);

  const overview = useQuery({ queryKey: ["admin-overview"], queryFn: () => fetchOverview() });
  const settings = useQuery({ queryKey: ["platform-settings"], queryFn: () => fetchSettings() });
  const developerSubscriptions = useQuery({
    queryKey: ["developer-subscriptions"],
    queryFn: () => fetchDeveloperSubscriptions(),
  });
  const promoCodes = useQuery({ queryKey: ["promo-codes"], queryFn: () => fetchPromoCodes() });

  const [form, setForm] = useState({
    platformName: "Zaka",
    saasMonthlyPrice: 1500,
    saasYearlyPrice: 15000,
    trialDays: 14,
    supportEmail: "support@zaka.ht",
    relayApkUrl: "",
  });

  useEffect(() => {
    if (!settings.data) return;
    setForm({
      platformName: settings.data.platform_name,
      saasMonthlyPrice: Number(settings.data.saas_monthly_price),
      saasYearlyPrice: Number(settings.data.saas_yearly_price),
      trialDays: settings.data.trial_days,
      supportEmail: settings.data.support_email,
      relayApkUrl: settings.data.relay_apk_url ?? "",
    });
  }, [settings.data]);

  const settingsMutation = useMutation({
    mutationFn: () => saveSettings({ data: { id: settings.data!.id, ...form } }),
    onSuccess: () => {
      toast.success("Paramètres de la plateforme enregistrés");
      queryClient.invalidateQueries({ queryKey: ["platform-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [invoice, setInvoice] = useState({
    developerId: "",
    developerEmail: "",
    amount: 1500,
    period: "monthly" as "monthly" | "yearly",
    dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
  });

  const invoiceMutation = useMutation({
    mutationFn: () => addInvoice({ data: invoice }),
    onSuccess: () => {
      toast.success("Facture créée");
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { invoiceId: string; status: "pending" | "paid" | "cancelled" }) =>
      updateInvoice({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [promo, setPromo] = useState({ code: "", durationType: "trial_days" as "lifetime" | "monthly" | "yearly" | "trial_days", trialDays: 15, maxRedemptions: 100 });
  const [rate, setRate] = useState({ currency: "USD", rateToHtg: 132 });
  const promoMutation = useMutation({
    mutationFn: () => addPromoCode({ data: promo }),
    onSuccess: () => {
      toast.success("Code promo créé");
      setPromo({ ...promo, code: "" });
      queryClient.invalidateQueries({ queryKey: ["promo-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const promoStatusMutation = useMutation({
    mutationFn: (data: { promoCodeId: string; active: boolean }) => togglePromoCode({ data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["promo-codes"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const rateMutation = useMutation({
    mutationFn: () => saveExchangeRate({ data: rate }),
    onSuccess: () => toast.success("Taux du jour enregistré"),
    onError: (e: Error) => toast.error(e.message),
  });
  const developerAccessMutation = useMutation({
    mutationFn: (data: { subscriptionId: string; active: boolean }) => updateDeveloperAccess({ data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["developer-subscriptions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (overview.isLoading) {
    return (
      <ConsoleShell>
        <Skeleton className="h-64 rounded-2xl" />
      </ConsoleShell>
    );
  }

  if (overview.error) {
    return (
      <ConsoleShell>
        <p className="text-sm text-destructive">{(overview.error as Error).message}</p>
      </ConsoleShell>
    );
  }

  const totals = overview.data!.totals;

  return (
    <ConsoleShell>
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
        <ShieldCheck className="size-6 text-primary" /> Administration Zaka
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Paramètres globaux de la plateforme et facturation des développeurs.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Développeurs", value: overview.data!.developers.length, icon: Building2 },
          { label: "Applications", value: totals.apps, icon: Building2 },
          { label: "Volume encaissé", value: formatHTG(totals.volume), icon: Wallet },
          { label: "Factures en attente", value: totals.pendingInvoices, icon: ReceiptText },
          { label: "Revenus factures", value: formatHTG(totals.invoiceRevenue), icon: Wallet },
        ].map((kpi) => (
          <div key={kpi.label} className="card-elevated rounded-2xl border border-border bg-card p-5">
            <kpi.icon className="size-4 text-primary" />
            <div className="mt-3 text-2xl font-bold">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="settings" className="mt-10">
        <TabsList>
          <TabsTrigger value="settings">Paramètres globaux</TabsTrigger>
          <TabsTrigger value="developers">Développeurs</TabsTrigger>
          <TabsTrigger value="billing">Facturation SaaS</TabsTrigger>
          <TabsTrigger value="access">Accès développeurs</TabsTrigger>
          <TabsTrigger value="promos">Promos & taux</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-6">
          <div className="grid max-w-3xl gap-5 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nom de la plateforme</Label>
              <Input
                value={form.platformName}
                onChange={(e) => setForm({ ...form, platformName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email de support</Label>
              <Input
                value={form.supportEmail}
                onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Abonnement SaaS mensuel (HTG)</Label>
              <Input
                type="number"
                value={form.saasMonthlyPrice}
                onChange={(e) => setForm({ ...form, saasMonthlyPrice: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Abonnement SaaS annuel (HTG)</Label>
              <Input
                type="number"
                value={form.saasYearlyPrice}
                onChange={(e) => setForm({ ...form, saasYearlyPrice: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Jours d'essai</Label>
              <Input
                type="number"
                value={form.trialDays}
                onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>URL de l'APK Zaka Relay</Label>
              <Input
                value={form.relayApkUrl}
                placeholder="https://…/zaka-relay-v1.apk"
                onChange={(e) => setForm({ ...form, relayApkUrl: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                disabled={!settings.data || settingsMutation.isPending}
                onClick={() => settingsMutation.mutate()}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="developers" className="mt-6">
          <div className="rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Développeur</TableHead>
                  <TableHead>Applications</TableHead>
                  <TableHead>Abonnés actifs</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.data!.developers.map((dev) => (
                  <TableRow key={dev.developerId}>
                    <TableCell className="font-medium">{dev.email}</TableCell>
                    <TableCell>{dev.apps}</TableCell>
                    <TableCell>{dev.activeSubs}</TableCell>
                    <TableCell className="text-right">{formatHTG(dev.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="billing" className="mt-6 space-y-6">
          <div className="grid max-w-4xl gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-5">
            <div className="space-y-2 sm:col-span-2">
              <Label>Développeur</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={invoice.developerId}
                onChange={(e) => {
                  const user = overview.data!.users.find((u) => u.id === e.target.value);
                  setInvoice({
                    ...invoice,
                    developerId: e.target.value,
                    developerEmail: user?.email ?? "",
                  });
                }}
              >
                <option value="">Sélectionner…</option>
                {overview.data!.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Montant (HTG)</Label>
              <Input
                type="number"
                value={invoice.amount}
                onChange={(e) => setInvoice({ ...invoice, amount: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Période</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={invoice.period}
                onChange={(e) =>
                  setInvoice({ ...invoice, period: e.target.value as "monthly" | "yearly" })
                }
              >
                <option value="monthly">Mensuel</option>
                <option value="yearly">Annuel</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Échéance</Label>
              <Input
                type="date"
                value={invoice.dueDate}
                onChange={(e) => setInvoice({ ...invoice, dueDate: e.target.value })}
              />
            </div>
            <div className="sm:col-span-5">
              <Button
                disabled={!invoice.developerId || invoiceMutation.isPending}
                onClick={() => invoiceMutation.mutate()}
              >
                Émettre la facture
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Développeur</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.data!.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.developer_email ?? inv.developer_id}</TableCell>
                    <TableCell>{formatHTG(Number(inv.amount))}</TableCell>
                    <TableCell>{inv.period === "yearly" ? "Annuel" : "Mensuel"}</TableCell>
                    <TableCell>{inv.due_date ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                        {inv.status === "paid"
                          ? "Payée"
                          : inv.status === "cancelled"
                            ? "Annulée"
                            : "En attente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            statusMutation.mutate({ invoiceId: inv.id, status: "paid" })
                          }
                        >
                          Marquer payée
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {overview.data!.invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      Aucune facture émise · dernière mise à jour {formatDate(new Date().toISOString())}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="access" className="mt-6">
          <div className="rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Développeur</TableHead><TableHead>Plan</TableHead><TableHead>Montant</TableHead><TableHead>Statut</TableHead><TableHead>Expiration</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {(developerSubscriptions.data ?? []).map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell>{subscription.email}</TableCell>
                    <TableCell>{subscription.plan}</TableCell>
                    <TableCell>{formatHTG(Number(subscription.amount))}</TableCell>
                    <TableCell><Badge variant={subscription.status === "expired" ? "destructive" : "default"}>{subscription.status}</Badge></TableCell>
                    <TableCell>{subscription.expires_at ? formatDate(subscription.expires_at) : "À vie"}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => developerAccessMutation.mutate({ subscriptionId: subscription.id, active: subscription.status === "cancelled" || subscription.status === "expired" })}>{subscription.status === "cancelled" || subscription.status === "expired" ? "Activer" : "Suspendre"}</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="promos" className="mt-6 space-y-6">
          <div className="grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-4">
            <div className="space-y-2"><Label>Code</Label><Input value={promo.code} placeholder="OLIGENS15" onChange={(e) => setPromo({ ...promo, code: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-2"><Label>Durée</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={promo.durationType} onChange={(e) => setPromo({ ...promo, durationType: e.target.value as typeof promo.durationType })}><option value="trial_days">Essai</option><option value="monthly">Mensuel</option><option value="yearly">Annuel</option><option value="lifetime">À vie</option></select></div>
            <div className="space-y-2"><Label>Jours d'essai</Label><Input type="number" value={promo.trialDays} disabled={promo.durationType !== "trial_days"} onChange={(e) => setPromo({ ...promo, trialDays: Number(e.target.value) })} /></div>
            <div className="space-y-2"><Label>Utilisations max.</Label><Input type="number" value={promo.maxRedemptions} onChange={(e) => setPromo({ ...promo, maxRedemptions: Number(e.target.value) })} /></div>
            <Button className="sm:col-span-4" disabled={!promo.code || promoMutation.isPending} onClick={() => promoMutation.mutate()}>Créer le code promo</Button>
          </div>
          <div className="grid max-w-xl gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-3">
            <div className="space-y-2"><Label>Devise</Label><Input value={rate.currency} maxLength={3} onChange={(e) => setRate({ ...rate, currency: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-2"><Label>1 devise = HTG</Label><Input type="number" value={rate.rateToHtg} onChange={(e) => setRate({ ...rate, rateToHtg: Number(e.target.value) })} /></div>
            <Button className="self-end" onClick={() => rateMutation.mutate()}>Enregistrer le taux</Button>
          </div>
          <div className="rounded-2xl border border-border bg-card"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Durée</TableHead><TableHead>Utilisations</TableHead><TableHead>État</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{(promoCodes.data ?? []).map((code) => <TableRow key={code.id}><TableCell className="font-mono">{code.code}</TableCell><TableCell>{code.duration_type}</TableCell><TableCell>{code.redemption_count}{code.max_redemptions ? ` / ${code.max_redemptions}` : ""}</TableCell><TableCell>{code.active ? "Actif" : "Désactivé"}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => promoStatusMutation.mutate({ promoCodeId: code.id, active: !code.active })}>{code.active ? "Désactiver" : "Activer"}</Button></TableCell></TableRow>)}</TableBody></Table></div>
        </TabsContent>
      </Tabs>
    </ConsoleShell>
  );
}
