import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Info, Loader2, QrCode, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PLANS, PROVIDERS, formatHTG, type PlanType, type Provider } from "@/lib/plans";
import { getCheckoutStatus, initDemoCheckout, getAppPlans } from "@/lib/checkout.functions";

type Props = { appId: string; userId?: string; triggerLabel?: string; defaultPlan?: PlanType };

const STEPS = ["Abonnement", "Paiement", "Confirmation"];

export function PaymentTunnel({
  appId,
  userId = "demo_user",
  triggerLabel = "Passer au plan Pro",
  defaultPlan = "monthly",
}: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState<PlanType>(defaultPlan);
  const [provider, setProvider] = useState<Provider>("moncash");
  const [accountName, setAccountName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("pending");
  const [customPlanKey, setCustomPlanKey] = useState<string | null>(null);

  const init = useServerFn(initDemoCheckout);
  const check = useServerFn(getCheckoutStatus);
  const fetchPlans = useServerFn(getAppPlans);

  // Récupérer les plans personnalisés de l'application
  const { data: customPlans } = useQuery({
    queryKey: ["app-plans", appId],
    queryFn: () => fetchPlans({ data: { appId } }),
    enabled: open, // Ne charger que lorsque le dialog est ouvert
    retry: false,
  });

  const hasCustomPlans = customPlans && customPlans.length > 0;

  useEffect(() => {
    if (!subscriptionId || status === "active") return;
    const timer = setInterval(async () => {
      try {
        const res = await check({ data: { subscriptionId } });
        setStatus(res.status);
      } catch {
        /* silencieux : nouvelle tentative au prochain cycle */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [subscriptionId, status, check]);

  function reset() {
    setStep(1);
    setAccountName("");
    setPhone("");
    setError(null);
    setSubscriptionId(null);
    setStatus("pending");
  }

  async function submit() {
    const trimmed = accountName.trim();
    if (trimmed.length < 3) {
      setError("Le nom complet du compte est obligatoire (3 caractères minimum).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await init({
        data: {
          appId,
          userId,
          accountName: trimmed,
          userPhone: phone.trim(),
          provider,
          planType: plan,
          customPlanKey: customPlanKey ?? undefined,
        },
      });
      setSubscriptionId(res.subscriptionId);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'initier le paiement.");
    } finally {
      setSubmitting(false);
    }
  }

  const activePlan = PLANS[plan];
  const activeProvider = PROVIDERS[provider];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2">
          <Sparkles className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {step === 1 && "Choisissez votre abonnement"}
            {step === 2 && "Mode de paiement"}
            {step === 3 && "Finalisez votre paiement"}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Débloquez toutes les fonctionnalités Pro, payables en gourdes."}
            {step === 2 && "MonCash ou Natcash — l'activation est automatique après réception du SMS."}
            {step === 3 && "Envoyez le montant exact depuis le compte indiqué."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-1">
          {STEPS.map((label, index) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                  index + 1 <= step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {index + 1}
              </div>
              <span
                className={cn(
                  "hidden text-xs sm:inline",
                  index + 1 === step ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {index < STEPS.length - 1 && <Separator className="flex-1" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            {/* Afficher les plans personnalisés s'ils existent */}
            {hasCustomPlans ? (
              <>
                <p className="text-sm text-muted-foreground mb-2">
                  Choisissez votre abonnement pour {customPlans[0]?.label && "découvrir nos offres"}:
                </p>
                {customPlans.map((customPlan) => (
                  <button
                    key={customPlan.id}
                    type="button"
                    onClick={() => {
                      setCustomPlanKey(customPlan.id);
                      // Pour les plans personnalisés, on garde monthly/yearly comme fallback
                      if (!plan) setPlan("monthly");
                    }}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition-colors",
                      customPlanKey === customPlan.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:border-primary/50",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-base font-semibold">{customPlan.label}</span>
                      {customPlan.badge && <Badge variant="secondary">{customPlan.badge}</Badge>}
                    </div>
                    <div className="mt-1 space-y-1">
                      {customPlan.currency !== "HTG" && (
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(customPlan.originalAmount, customPlan.currency)} 
                          {" → "}
                        </div>
                      )}
                      <div className="text-2xl font-bold text-primary">
                        {formatHTG(customPlan.htgAmount)}
                      </div>
                    </div>
                    {customPlan.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {customPlan.description}
                      </p>
                    )}
                  </button>
                ))}
              </>
            ) : (
              /* Plans par défaut Zaka Pro */
              Object.values(PLANS).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setCustomPlanKey(null);
                    setPlan(p.id);
                  }}
                  className={cn(
                    "w-full rounded-xl border p-4 text-left transition-colors",
                    plan === p.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-primary/50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-base font-semibold">{p.label}</span>
                    {p.badge && <Badge variant="secondary">{p.badge}</Badge>}
                  </div>
                  <div className="mt-1 text-2xl font-bold text-primary">{formatHTG(p.amount)}</div>
                  <p className="text-xs text-muted-foreground">
                    {p.period} · {p.hint}
                  </p>
                </button>
              ))
            )}
            <Button className="w-full" onClick={() => setStep(2)}>
              Continuer
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {Object.values(PROVIDERS).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    provider === p.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-primary/50",
                  )}
                >
                  <Smartphone
                    className={cn(
                      "mb-2 size-5",
                      p.id === "moncash" ? "text-moncash" : "text-natcash",
                    )}
                  />
                  <div className="font-semibold">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.number}</div>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="account-name">Nom complet du compte</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-accent underline-offset-2 hover:underline"
                      >
                        <Info className="size-3.5" /> En savoir plus
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Le nom saisi doit correspondre <strong>exactement</strong> au nom du compte{" "}
                      {activeProvider.label} qui envoie l'argent. Sinon, le SMS de confirmation ne
                      pourra pas être rapproché et l'activation échouera.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="account-name"
                maxLength={80}
                placeholder="Ex. Jean Baptiste"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Doit correspondre exactement au nom du compte émetteur.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Numéro de téléphone (optionnel)</Label>
              <Input
                id="phone"
                maxLength={20}
                placeholder="509 3711 2233"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Retour
              </Button>
              <Button className="flex-1" onClick={submit} disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Payer {formatHTG(activePlan.amount)}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-4">
                <div className="flex size-28 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground">
                  <QrCode className="size-10" />
                  <span className="mt-1 text-[10px]">QR {activeProvider.label}</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Montant exact à envoyer</div>
                  <div className="text-2xl font-bold text-primary">
                    {formatHTG(activePlan.amount)}
                  </div>
                  <div className="text-muted-foreground">Numéro marchand</div>
                  <div className="font-mono text-base">{activeProvider.number}</div>
                </div>
              </div>
            </div>

            <ol className="space-y-2 text-sm text-muted-foreground">
              {activeProvider.instructions.map((line, i) => (
                <li key={line} className="flex gap-2">
                  <span className="font-mono text-primary">{i + 1}.</span>
                  {line}
                </li>
              ))}
            </ol>

            <div
              className={cn(
                "flex items-center gap-3 rounded-xl border p-4",
                status === "active"
                  ? "border-primary/60 bg-primary/10"
                  : "border-accent/50 bg-accent/10",
              )}
            >
              {status === "active" ? (
                <CheckCircle2 className="size-5 text-primary" />
              ) : (
                <Loader2 className="size-5 animate-spin text-accent" />
              )}
              <div className="text-sm">
                <div className="font-semibold">
                  {status === "active"
                    ? "Paiement confirmé — abonnement Pro activé"
                    : "En attente de paiement SMS..."}
                </div>
                <div className="text-xs text-muted-foreground">
                  {status === "active"
                    ? "Merci ! Votre accès Pro est désormais actif."
                    : "Vérification automatique toutes les 5 secondes."}
                </div>
              </div>
            </div>

            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" />
              Référence : <span className="font-mono">{subscriptionId?.slice(0, 8)}</span>
            </p>

            <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
              Fermer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
