import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowLeft, Copy, Eye, EyeOff, Info, KeyRound, Link2 as LinkIcon, RefreshCw,
  TrendingUp, Users, Wallet,
} from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAppOverview, regenerateApiKey, updateAppSettings } from "@/lib/developer.functions";
import { getPlatformSettings } from "@/lib/admin.functions";
import { formatDate, formatHTG } from "@/lib/plans";
import { getAppPlans, createAppPlan, updateAppPlan, deleteAppPlan, getExchangeRates } from "@/lib/app-plans.functions";

export const Route = createFileRoute("/_authenticated/apps/$appId")({
  head: () => ({
    meta: [
      { title: "Tableau de bord de l'application — Zaka" },
      { name: "description", content: "Statistiques, transactions MonCash/Natcash, passerelle SMS et règles de matching de votre application Zaka." },
      { property: "og:title", content: "Tableau de bord de l'application — Zaka" },
      { property: "og:description", content: "KPIs, revenus en gourdes et paramètres avancés du relais SMS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppDetailPage,
});

async function copy(value: string, message: string) {
  await navigator.clipboard.writeText(value);
  toast.success(message);
}

function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><Info className="size-4 text-primary" /> {title}</div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function AppDetailPage() {
  const { appId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getAppOverview);
  const fetchSettings = useServerFn(getPlatformSettings);
  const saveSettings = useServerFn(updateAppSettings);
  const rotateKey = useServerFn(regenerateApiKey);
  const { data, isLoading, error } = useQuery({ queryKey: ["app", appId], queryFn: () => fetchOverview({ data: { appId } }) });
  const { data: platform } = useQuery({ queryKey: ["platform-settings"], queryFn: () => fetchSettings() });

  const [showKey, setShowKey] = useState(false);
  const [linkPlan, setLinkPlan] = useState("");
  const [linkUser, setLinkUser] = useState("");
  const [form, setForm] = useState({ name: "", moncashNumber: "", natcashNumber: "", qrImageUrl: "", whitelist: "", amountRegex: "", nameRegex: "", referenceRegex: "", strictNameMatch: true });

  const fetchPlans = useServerFn(getAppPlans);
  const createPlan = useServerFn(createAppPlan);
  const updatePlanMutation = useServerFn(updateAppPlan);
  const deletePlanMutation = useServerFn(deleteAppPlan);
  const fetchRates = useServerFn(getExchangeRates);
  const { data: customPlans = [], refetch: refetchPlans } = useQuery({ queryKey: ["app-plans", appId], queryFn: () => fetchPlans({ data: { appId } }) });
  const { data: exchangeRates = [] } = useQuery({ queryKey: ["exchange-rates"], queryFn: () => fetchRates() });

  const [newPlan, setNewPlan] = useState({ planKey: "", name: "", amount: "", currency: "USD", period: "monthly" as "trial" | "monthly" | "yearly" | "custom", description: "" });

  useEffect(() => {
    if (!data?.app) return;
    const a = data.app;
    setForm({ name: a.name, moncashNumber: a.moncash_number ?? "", natcashNumber: a.natcash_number ?? "", qrImageUrl: a.qr_image_url ?? "", whitelist: (a.sender_whitelist ?? []).join(", "), amountRegex: a.amount_regex ?? "", nameRegex: a.name_regex ?? "", referenceRegex: a.reference_regex ?? "", strictNameMatch: a.strict_name_match ?? true });
  }, [data?.app]);

  useEffect(() => {
    const activePlans = customPlans.filter((plan: any) => plan.active !== false);
    if (activePlans.length === 0) {
      setLinkPlan("");
      return;
    }
    if (!activePlans.some((plan: any) => plan.plan_key === linkPlan)) setLinkPlan(String(activePlans[0].plan_key));
  }, [customPlans, linkPlan]);

  const settingsMutation = useMutation({
    mutationFn: () => saveSettings({ data: { appId, name: form.name, moncashNumber: form.moncashNumber || null, natcashNumber: form.natcashNumber || null, qrImageUrl: form.qrImageUrl || null, senderWhitelist: form.whitelist.split(",").map((s) => s.trim()).filter(Boolean), amountRegex: form.amountRegex, nameRegex: form.nameRegex, referenceRegex: form.referenceRegex, strictNameMatch: form.strictNameMatch } }),
    onSuccess: () => { toast.success("Paramètres enregistrés"); queryClient.invalidateQueries({ queryKey: ["app", appId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const keyMutation = useMutation({
    mutationFn: () => rotateKey({ data: { appId } }),
    onSuccess: () => { toast.success("Nouvelle clé API générée"); queryClient.invalidateQueries({ queryKey: ["app", appId] }); queryClient.invalidateQueries({ queryKey: ["my-apps"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const createPlanMutation = useMutation({
    mutationFn: () => createPlan({ data: { appId, planKey: newPlan.planKey, name: newPlan.name, amount: parseFloat(newPlan.amount) || 0, currency: newPlan.currency, period: newPlan.period, description: newPlan.description } }),
    onSuccess: () => { toast.success("Plan créé avec succès"); setNewPlan({ planKey: "", name: "", amount: "", currency: "USD", period: "monthly", description: "" }); refetchPlans(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updatePlanMut = useMutation({
    mutationFn: (plan: typeof customPlans[0] & { active: boolean }) => updatePlanMutation({ data: { planId: plan.id, appId, name: plan.name, amount: plan.amount, currency: plan.currency, period: plan.period, description: plan.description ?? "", active: plan.active } }),
    onSuccess: () => { toast.success("Plan mis à jour"); refetchPlans(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deletePlanMut = useMutation({
    mutationFn: (planId: string) => deletePlanMutation({ data: { planId, appId } }),
    onSuccess: () => { toast.success("Plan supprimé"); refetchPlans(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const getRateForCurrency = (currency: string) => exchangeRates.find((r: any) => r.currency === currency)?.rate_to_htg ?? null;
  const formatAmountWithConversion = (amount: number, currency: string) => { const rate = getRateForCurrency(currency); if (!rate) return `${amount} ${currency}`; return `${amount} ${currency} (~${formatHTG(Math.ceil(amount * rate))})`; };

  if (isLoading) return <ConsoleShell><Skeleton className="h-72 rounded-2xl" /></ConsoleShell>;
  if (error || !data) return <ConsoleShell><p className="text-sm text-destructive">{(error as Error)?.message ?? "Introuvable"}</p></ConsoleShell>;

  const { app, kpis, chart, transactions } = data;
  const activePlans = customPlans.filter((plan: any) => plan.active !== false);
  const zakaPayOrigin = "https://zakaproht.vercel.app";
  const payUrl = linkPlan
    ? `${zakaPayOrigin}/pay?api_key=${encodeURIComponent(app.api_key)}&plan=${encodeURIComponent(linkPlan)}${linkUser.trim() ? `&user_id=${encodeURIComponent(linkUser.trim())}` : ""}`
    : "";

  return (
    <ConsoleShell>
      <Button asChild variant="ghost" size="sm" className="gap-2"><Link to="/dashboard"><ArrowLeft className="size-4" /> Applications</Link></Button>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="font-display text-3xl font-bold">{app.name}</h1><p className="font-mono text-xs text-muted-foreground">{app.slug}</p></div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 font-mono text-[10px]"><KeyRound className="size-3" /> {app.api_key.slice(0, 18)}…</Badge>
          <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(app.api_key); toast.success("Clé API copiée"); }}><Copy className="size-4" /></Button>
          <Button size="sm" variant="outline" className="gap-2" disabled={keyMutation.isPending} onClick={() => keyMutation.mutate()}><RefreshCw className="size-4" /> Régénérer</Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList><TabsTrigger value="overview">Vue d'ensemble</TabsTrigger><TabsTrigger value="config">Configuration</TabsTrigger><TabsTrigger value="api">API & Intégration</TabsTrigger><TabsTrigger value="relay">Relais SMS</TabsTrigger><TabsTrigger value="settings">Paramètres avancés</TabsTrigger></TabsList>

        <TabsContent value="overview" className="mt-6 space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
            { label: "Abonnés Pro actifs", value: kpis.activeCount, icon: Users }, { label: "Total encaissé", value: formatHTG(kpis.revenue), icon: Wallet }, { label: "Taux de conversion", value: `${kpis.conversion} %`, icon: TrendingUp }, { label: "Expirent sous 7 jours", value: kpis.expiringSoon, icon: RefreshCw },
          ].map((kpi) => <div key={kpi.label} className="card-elevated rounded-2xl border border-border bg-card p-5"><kpi.icon className="size-4 text-primary" /><div className="mt-3 text-2xl font-bold">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div></div>)}</div>
          <div className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-semibold">Revenus & souscriptions</h2><div className="mt-6 h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="month" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend /><Area type="monotone" dataKey="revenus" stroke="hsl(var(--primary))" fill="url(#rev)" /><Area type="monotone" dataKey="souscriptions" stroke="hsl(var(--accent))" fillOpacity={0} /></AreaChart></ResponsiveContainer></div></div>
          <div className="rounded-2xl border border-border bg-card"><Table><TableHeader><TableRow><TableHead>Utilisateur</TableHead><TableHead>Téléphone</TableHead><TableHead>Moyen</TableHead><TableHead>Montant</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Date</TableHead></TableRow></TableHeader><TableBody>{transactions.map((t) => <TableRow key={t.id}><TableCell><div className="font-medium">{t.account_name}</div><div className="text-xs text-muted-foreground">{t.user_id}</div></TableCell><TableCell>{t.user_phone ?? "—"}</TableCell><TableCell className="capitalize">{t.provider}</TableCell><TableCell>{formatHTG(Number(t.amount))}</TableCell><TableCell><Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status === "active" ? "Validé" : t.status === "expired" ? "Expiré" : "En attente"}</Badge></TableCell><TableCell className="text-right text-xs">{formatDate(t.created_at)}</TableCell></TableRow>)}</TableBody></Table></div>
        </TabsContent>

        <TabsContent value="relay" className="mt-6"><RelayBlock appId={appId} appName={app.name} apiKey={app.api_key} apkUrl={platform?.relay_apk_url} /></TabsContent>

        <TabsContent value="config" className="mt-6"><div className="grid max-w-4xl gap-6"><section className="rounded-2xl border border-border bg-card p-6"><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Moyens de paiement</h2><TooltipProvider><UiTooltip><TooltipTrigger asChild><Info className="size-4 cursor-help text-muted-foreground" /></TooltipTrigger><TooltipContent className="max-w-xs">Ces numéros sont affichés à vos utilisateurs pendant le tunnel de paiement Zaka.</TooltipContent></UiTooltip></TooltipProvider></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Nom de l'application</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div className="space-y-2"><Label>URL du QR code de réception</Label><Input value={form.qrImageUrl} placeholder="https://…/qr-moncash.png" onChange={(e) => setForm({ ...form, qrImageUrl: e.target.value })} /></div><div className="space-y-2"><Label>Numéro MonCash</Label><Input value={form.moncashNumber} placeholder="+509 …" onChange={(e) => setForm({ ...form, moncashNumber: e.target.value })} /></div><div className="space-y-2"><Label>Numéro Natcash</Label><Input value={form.natcashNumber} placeholder="+509 …" onChange={(e) => setForm({ ...form, natcashNumber: e.target.value })} /></div></div><div className="mt-5"><Button disabled={settingsMutation.isPending} onClick={() => settingsMutation.mutate()}>Enregistrer mes numéros</Button></div><Callout title="Étape 1 — Configuration initiale">Configurez vos numéros de réception ci-dessus. Zaka affichera ces numéros à vos utilisateurs lorsqu'ils choisiront de passer en mode Pro.</Callout></section></div></TabsContent>

        <TabsContent value="api" className="mt-6">
          <div className="grid max-w-4xl gap-6">
            <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-semibold">Clé API (x-api-key)</h2><p className="mt-1 text-sm text-muted-foreground">Gardez-la secrète. En cas de compromission, régénérez-la : l'ancienne clé cesse immédiatement de fonctionner.</p><div className="mt-4 flex flex-wrap items-center gap-2"><code className="flex-1 overflow-x-auto rounded-xl border border-border bg-muted/40 px-4 py-3 font-mono text-xs">{showKey ? app.api_key : `${app.api_key.slice(0, 12)}${"•".repeat(18)}`}</code><Button size="sm" variant="outline" onClick={() => setShowKey((v) => !v)}>{showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button><Button size="sm" variant="outline" onClick={() => copy(app.api_key, "Clé API copiée")}><Copy className="size-4" /></Button><Button size="sm" variant="outline" className="gap-2" disabled={keyMutation.isPending} onClick={() => keyMutation.mutate()}><RefreshCw className="size-4" /> Régénérer ma clé</Button></div></section>
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2"><LinkIcon className="size-4 text-primary" /><h2 className="text-lg font-semibold">Générateur d'URL de paiement</h2></div>
              <p className="mt-1 text-sm text-muted-foreground">Sélectionnez un plan personnalisé actif. La liste est synchronisée avec les plans de cette application.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>Plan proposé</Label><Select value={linkPlan || undefined} onValueChange={setLinkPlan} disabled={activePlans.length === 0}><SelectTrigger><SelectValue placeholder={activePlans.length ? "Sélectionner un plan" : "Aucun plan actif configuré"} /></SelectTrigger><SelectContent>{activePlans.map((plan: any) => <SelectItem key={plan.id} value={String(plan.plan_key)}>{plan.name} ({plan.plan_key})</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Identifiant utilisateur (optionnel)</Label><Input value={linkUser} placeholder="user_123" onChange={(e) => setLinkUser(e.target.value)} /></div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2"><code className="flex-1 overflow-x-auto rounded-xl border border-border bg-muted/40 px-4 py-3 font-mono text-xs">{payUrl || "Créez d'abord au moins un plan actif dans Paramètres avancés."}</code><Button size="sm" className="gap-2" disabled={!payUrl} onClick={() => copy(payUrl, "Lien de paiement copié")}><Copy className="size-4" /> Copier le lien</Button></div>
              <Callout title="Étape 2 — Le bouton « Passer en Pro »">Insérez un bouton dans votre application. Au clic, redirigez simplement l'utilisateur vers cette URL. Zaka se charge de tout le processus de paiement (choix du plan, MonCash/Natcash, confirmation SMS).</Callout>
              <Callout title="Étape 3 — Validation du paiement">Une fois le paiement validé, l'abonnement passe en <code>active</code>. Votre serveur peut le vérifier à tout moment via <code>GET /api/public/v1/license/verify?user_id=…</code> avec votre en-tête <code>x-api-key</code>.</Callout>
            </section>

            {/* NOUVELLE SECTION : SNIPPET D'INTÉGRATION PRÊT À L'EMPLOI */}
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2"><KeyRound className="size-4 text-primary" /><h2 className="text-lg font-semibold">Snippet d'Intégration / Code Prêt à l'Emploi</h2></div>
              <p className="mt-1 text-sm text-muted-foreground">Copiez ce code React/TypeScript dans votre application pour intégrer le paiement Zaka instantanément.</p>
              
              <div className="mt-4 relative">
                <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
                  <pre className="max-h-[500px] overflow-auto p-4 text-xs">
                    <code className="language-typescript">{`/**
 * SNIPPET D'INTÉGRATION ZAKA - PRÊT À L'EMPLOI
 * Application: ${app.name}
 * Clé API: ${showKey ? app.api_key : 'sk_live_...'}
 */

import React, { useState } from 'react';

const ZAKA_CONFIG = {
  API_KEY: '${app.api_key}', // Votre clé API
  BASE_URL: 'https://zakaproht.vercel.app',
};

interface ZakaPaymentButtonProps {
  planKey: string;  // Ex: 'pro', 'enterprise'
  userId: string;   // ID utilisateur connecté
  children?: React.ReactNode;
}

export const ZakaPaymentButton: React.FC<ZakaPaymentButtonProps> = ({
  planKey,
  userId,
  children,
}) => {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);
    try {
      const response = await fetch(\`\${ZAKA_CONFIG.BASE_URL}/api/payment/create-session\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ZAKA_CONFIG.API_KEY,
        },
        body: JSON.stringify({
          plan_key: planKey,
          user_id: userId,
          currency: 'USD',
        }),
      });

      if (!response.ok) throw new Error('Échec création session');
      
      const session = await response.json();
      window.location.href = \`\${ZAKA_CONFIG.BASE_URL}/pay?session_id=\${session.session_id}\`;
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePayment}
      disabled={loading}
      style={{
        padding: '12px 24px',
        backgroundColor: loading ? '#ccc' : '#6366f1',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: loading ? 'not-allowed' : 'pointer',
      }}
    >
      {loading ? 'Traitement...' : children || \`Payer \${planKey}\`}
    </button>
  );
};

// EXEMPLE D'UTILISATION
function PricingPage() {
  const userId = 'user_123'; // Remplacez par votre utilisateur
  
  return (
    <div>
      <h3>Plan Pro - $15/mois</h3>
      <ZakaPaymentButton planKey="pro" userId={userId}>
        Choisir le Plan Pro
      </ZakaPaymentButton>
    </div>
  );
}`}</code>
                  </pre>
                </div>
                <Button 
                  size="sm" 
                  className="absolute top-2 right-2 gap-2" 
                  onClick={() => copy(`/**
 * SNIPPET D'INTÉGRATION ZAKA - ${app.name}
 */

import React, { useState } from 'react';

const ZAKA_CONFIG = {
  API_KEY: '${app.api_key}',
  BASE_URL: 'https://zakaproht.vercel.app',
};

interface ZakaPaymentButtonProps {
  planKey: string;
  userId: string;
  children?: React.ReactNode;
}

export const ZakaPaymentButton: React.FC<ZakaPaymentButtonProps> = ({
  planKey,
  userId,
  children,
}) => {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);
    try {
      const response = await fetch(\`\${ZAKA_CONFIG.BASE_URL}/api/payment/create-session\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ZAKA_CONFIG.API_KEY,
        },
        body: JSON.stringify({
          plan_key: planKey,
          user_id: userId,
          currency: 'USD',
        }),
      });

      if (!response.ok) throw new Error('Échec création session');
      
      const session = await response.json();
      window.location.href = \`\${ZAKA_CONFIG.BASE_URL}/pay?session_id=\${session.session_id}\`;
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePayment}
      disabled={loading}
      style={{
        padding: '12px 24px',
        backgroundColor: loading ? '#ccc' : '#6366f1',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: loading ? 'not-allowed' : 'pointer',
      }}
    >
      {loading ? 'Traitement...' : children || \`Payer \${planKey}\`}
    </button>
  );
};`, "Code snippet copié !")}
                >
                  <Copy className="size-4" /> Copier le code
                </Button>
              </div>
              
              <Callout title="Comment utiliser ce snippet ?">
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm">
                  <li>Copiez le code ci-dessus dans votre projet React/TypeScript</li>
                  <li>Importez <code>ZakaPaymentButton</code> dans votre page de pricing</li>
                  <li>Utilisez le composant avec le <code>planKey</code> de votre choix (ex: "pro", "enterprise")</li>
                  <li>Passez l'<code>userId</code> de l'utilisateur connecté</li>
                  <li>Le bouton redirigera automatiquement vers le tunnel de paiement Zaka sécurisé</li>
                </ol>
              </Callout>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-6"><div className="grid max-w-4xl gap-6">
          <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-semibold">Plans de tarification personnalisés</h2><p className="mt-1 text-sm text-muted-foreground">Définissez vos propres plans pour cette application. Les montants seront convertis automatiquement en HTG lors du paiement.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Clé du plan</Label><Input placeholder="ex: premium, essai, enterprise" value={newPlan.planKey} onChange={(e) => setNewPlan({ ...newPlan, planKey: e.target.value })} /></div><div className="space-y-2"><Label>Nom du plan</Label><Input placeholder="ex: Plan Premium" value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} /></div><div className="space-y-2"><Label>Période</Label><Select value={newPlan.period} onValueChange={(v) => setNewPlan({ ...newPlan, period: v as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="trial">Essai</SelectItem><SelectItem value="monthly">Mensuel</SelectItem><SelectItem value="yearly">Annuel</SelectItem><SelectItem value="custom">Personnalisé</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Montant</Label><Input type="number" step="0.01" placeholder="15.00" value={newPlan.amount} onChange={(e) => setNewPlan({ ...newPlan, amount: e.target.value })} /></div><div className="space-y-2"><Label>Devise</Label><Select value={newPlan.currency} onValueChange={(v) => setNewPlan({ ...newPlan, currency: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD ($)</SelectItem><SelectItem value="EUR">EUR (€)</SelectItem><SelectItem value="HTG">HTG (G)</SelectItem><SelectItem value="CAD">CAD ($)</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Description (optionnel)</Label><Input placeholder="Avantages du plan..." value={newPlan.description} onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })} /></div></div>
            <div className="mt-4"><Button disabled={createPlanMutation.isPending || !newPlan.planKey || !newPlan.name || !newPlan.amount} onClick={() => createPlanMutation.mutate()}>{createPlanMutation.isPending ? "Création..." : "Ajouter le plan"}</Button></div>
            {customPlans.length > 0 && <div className="mt-6 space-y-3"><h3 className="text-sm font-semibold">Plans configurés</h3><div className="space-y-2">{customPlans.map((plan: any) => <div key={plan.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4"><div className="flex-1"><div className="flex items-center gap-2"><span className="font-semibold">{plan.name}</span><Badge variant={plan.active ? "default" : "secondary"} className="text-xs">{plan.active ? "Actif" : "Inactif"}</Badge><code className="text-xs text-muted-foreground">({plan.plan_key})</code></div><div className="mt-1 text-sm text-muted-foreground">{formatAmountWithConversion(plan.amount, plan.currency)} • {plan.period}{plan.description && ` • ${plan.description}`}</div></div><div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => updatePlanMut.mutate({ ...plan, active: !plan.active })}>{plan.active ? "Désactiver" : "Activer"}</Button><Button size="sm" variant="destructive" onClick={() => deletePlanMut.mutate(plan.id)}>Supprimer</Button></div></div>)}</div></div>}
            {exchangeRates.length > 0 && <div className="mt-6 rounded-xl border border-border bg-primary/5 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-primary"><Info className="size-4" /> Taux de change actuels</div><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">{exchangeRates.map((rate: any) => <span key={rate.currency}>1 {rate.currency} = {Number(rate.rate_to_htg).toFixed(2)} HTG</span>)}</div></div>}
          </section>
          <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-semibold">Filtrage & parsing intelligent</h2><p className="mt-1 text-sm text-muted-foreground">Seuls les SMS des expéditeurs officiels sont traités. Le joker <code>*</code> est accepté dans les masques.</p><div className="mt-5 space-y-4"><div className="space-y-2"><Label>Whitelist des expéditeurs (séparés par des virgules)</Label><Input value={form.whitelist} placeholder="MonCash, Digicel, Natcash, Natcom" onChange={(e) => setForm({ ...form, whitelist: e.target.value })} /></div><div className="space-y-2"><Label>Regex montant (HTG)</Label><Input className="font-mono text-xs" value={form.amountRegex} onChange={(e) => setForm({ ...form, amountRegex: e.target.value })} /></div><div className="space-y-2"><Label>Regex nom du compte émetteur</Label><Input className="font-mono text-xs" value={form.nameRegex} onChange={(e) => setForm({ ...form, nameRegex: e.target.value })} /></div><div className="space-y-2"><Label>Regex référence de transaction</Label><Input className="font-mono text-xs" value={form.referenceRegex} onChange={(e) => setForm({ ...form, referenceRegex: e.target.value })} /></div><div className="flex items-center justify-between rounded-xl border border-border p-4"><div><div className="text-sm font-medium">Rapprochement strict du nom</div><p className="text-xs text-muted-foreground">Le nom émetteur du SMS doit correspondre exactement au nom saisi dans le tunnel de paiement.</p></div><Switch checked={form.strictNameMatch} onCheckedChange={(v) => setForm({ ...form, strictNameMatch: v })} /></div></div></section>
          <div><Button disabled={settingsMutation.isPending} onClick={() => settingsMutation.mutate()}>Enregistrer les paramètres</Button></div>
        </div></TabsContent>
      </Tabs>
    </ConsoleShell>
  );
}
