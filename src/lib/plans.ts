export type PlanType = "monthly" | "yearly";
export type Provider = "moncash" | "natcash";

export const PLANS: Record<
  PlanType,
  { id: PlanType; label: string; amount: number; period: string; hint: string; badge?: string }
> = {
  monthly: {
    id: "monthly",
    label: "Pro Mensuel",
    amount: 250,
    period: "par mois",
    hint: "Facturé chaque mois, annulable à tout moment.",
  },
  yearly: {
    id: "yearly",
    label: "Pro Annuel",
    amount: 2500,
    period: "par an",
    hint: "2 mois offerts par rapport au mensuel.",
    badge: "Économisez 500 HTG",
  },
};

export const PROVIDERS: Record<
  Provider,
  { id: Provider; label: string; number: string; instructions: string[] }
> = {
  moncash: {
    id: "moncash",
    label: "MonCash",
    number: "+509 3712 0099",
    instructions: [
      "Composez *202# sur votre téléphone Digicel.",
      "Choisissez « Transfert / Peye Machann ».",
      "Entrez le numéro marchand affiché ci-dessous.",
      "Entrez le montant exact indiqué puis validez.",
    ],
  },
  natcash: {
    id: "natcash",
    label: "Natcash",
    number: "+509 4088 0099",
    instructions: [
      "Ouvrez l'application Natcash ou composez *888#.",
      "Choisissez « Voye Lajan ».",
      "Entrez le numéro marchand affiché ci-dessous.",
      "Entrez le montant exact indiqué puis validez.",
    ],
  },
};

export function formatHTG(value: number) {
  return `${new Intl.NumberFormat("fr-HT", { maximumFractionDigits: 0 }).format(value)} HTG`;
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
