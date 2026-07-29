/** Moteur de parsing & extraction intelligente des SMS MonCash / Natcash. */

export type ParseRules = {
  senderWhitelist: string[];
  amountRegex: string;
  nameRegex: string;
  referenceRegex: string;
};

export const DEFAULT_RULES: ParseRules = {
  senderWhitelist: ["MonCash", "Digicel", "Natcash", "Natcom"],
  amountRegex: String.raw`(?:HTG|Gdes?|Gourdes?)\s*([\d.,]+)|([\d.,]+)\s*(?:HTG|Gdes?|Gourdes?)`,
  nameRegex: String.raw`(?:de|from|soti nan|par|sent by)\s+([A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+){0,3})`,
  referenceRegex: String.raw`(?:Ref|Reference|Transaction ID|ID)\s*[:#]?\s*([A-Za-z0-9]{4,})`,
};

function firstGroup(text: string, pattern: string): string | null {
  try {
    const match = text.match(new RegExp(pattern, "i"));
    if (!match) return null;
    return match.slice(1).find((g) => typeof g === "string" && g.length > 0) ?? null;
  } catch {
    return null;
  }
}

/** Un masque accepte le joker `*` : « MonCash* », « *Natcom* », « 509* ». */
export function matchesMask(value: string, mask: string) {
  const escaped = mask
    .trim()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  try {
    return new RegExp(`^${escaped}$`, "i").test(value.trim());
  } catch {
    return false;
  }
}

/** Whitelist des expéditeurs officiels. Liste vide = aucun filtrage. */
export function isSenderAllowed(sender: string | null | undefined, whitelist: string[]) {
  const list = (whitelist ?? []).filter((m) => m.trim().length > 0);
  if (list.length === 0) return true;
  if (!sender) return false;
  return list.some((mask) => matchesMask(sender, mask) || matchesMask(sender, `*${mask}*`));
}

export function parseSms(raw: string, rules: ParseRules = DEFAULT_RULES) {
  const text = raw.replace(/\s+/g, " ").trim();

  const amountRaw = firstGroup(text, rules.amountRegex || DEFAULT_RULES.amountRegex);
  let amount: number | null = null;
  if (amountRaw) {
    const value = Number.parseFloat(amountRaw.replace(/,/g, ""));
    amount = Number.isFinite(value) ? value : null;
  }

  const phoneMatch = text.match(/(?:\+?509)?[\s-]?(\d{4})[\s-]?(\d{4})/);
  const phone = phoneMatch ? `509${phoneMatch[1]}${phoneMatch[2]}` : null;

  const name = firstGroup(text, rules.nameRegex || DEFAULT_RULES.nameRegex);
  const reference = firstGroup(text, rules.referenceRegex || DEFAULT_RULES.referenceRegex);

  return {
    amount,
    phone,
    name: name ? name.trim() : null,
    reference: reference ? reference.trim() : null,
  };
}

export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rapprochement du nom : strict (égalité normalisée) ou souple (inclusion). */
export function namesMatch(a: string, b: string, strict: boolean) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (strict) return na === nb;
  return na.includes(nb) || nb.includes(na);
}
