/** Analyse d'un SMS de confirmation MonCash / Natcash. */
export function parseSms(raw: string): { amount: number | null; phone: string | null; name: string | null } {
  const text = raw.replace(/\s+/g, " ").trim();

  // Montant : "250.00 HTG", "HTG 2,500", "Gdes 250"
  const amountMatch =
    text.match(/(?:HTG|Gdes?|Gourdes?)\s*([\d.,]+)/i) ||
    text.match(/([\d.,]+)\s*(?:HTG|Gdes?|Gourdes?)/i);
  let amount: number | null = null;
  if (amountMatch) {
    const normalized = amountMatch[1].replace(/,/g, "");
    const value = Number.parseFloat(normalized);
    amount = Number.isFinite(value) ? value : null;
  }

  // Téléphone haïtien : 509XXXXXXXX ou XXXX-XXXX
  const phoneMatch = text.match(/(?:\+?509)?[\s-]?(\d{4})[\s-]?(\d{4})/);
  const phone = phoneMatch ? `509${phoneMatch[1]}${phoneMatch[2]}` : null;

  // Nom de l'émetteur : "de Jean Baptiste", "from Marie Claire", "soti nan Ricardo Louis"
  const nameMatch = text.match(
    /(?:de|from|soti nan|par|sent by)\s+([A-Za-zÀ-ÿ'’-]+(?:\s+[A-Za-zÀ-ÿ'’-]+){0,3})/i,
  );
  const name = nameMatch ? nameMatch[1].trim() : null;

  return { amount, phone, name };
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
