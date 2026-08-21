/**
 * Fonctions utilitaires pour la conversion de devises
 * Permet de convertir les montants des plans personnalisés en HTG
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Récupère le taux de change actuel pour une paire de devises donnée
 * Utilise d'abord la base de données, avec fallback sur des valeurs par défaut
 */
export const getExchangeRate = createServerFn({ method: "GET" })
  .inputValidator((input) => 
    z.object({ 
      baseCurrency: z.string().length(3), 
      targetCurrency: z.string().length(3) 
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const sql = db();
    
    const { baseCurrency, targetCurrency } = data;
    
    // Si la devise cible est déjà HTG, pas besoin de conversion
    if (targetCurrency === "HTG") {
      return { rate: 1, source: "direct" };
    }
    
    // Si les devises sont identiques
    if (baseCurrency === targetCurrency) {
      return { rate: 1, source: "same" };
    }
    
    try {
      // Recherche du taux actuel dans la base de données
      const rows = (await sql`
        SELECT rate, source 
        FROM exchange_rates 
        WHERE base_currency = ${baseCurrency} 
          AND target_currency = ${targetCurrency} 
          AND is_current = true 
        LIMIT 1
      `) as { rate: string; source: string }[];
      
      if (rows.length > 0 && rows[0]) {
        return { 
          rate: Number(rows[0].rate), 
          source: rows[0].source || "database" 
        };
      }
      
      // Taux par défaut si non trouvé en base
      const defaultRates: Record<string, number> = {
        USD: 130, // 1 USD = 130 HTG (taux approximatif)
        EUR: 140, // 1 EUR = 140 HTG
        CAD: 95,  // 1 CAD = 95 HTG
        GBP: 165, // 1 GBP = 165 HTG
      };
      
      const defaultRate = defaultRates[baseCurrency] ?? 130;
      console.warn(`[getExchangeRate] Taux non trouvé pour ${baseCurrency}->${targetCurrency}, utilisation du taux par défaut: ${defaultRate}`);
      
      return { rate: defaultRate, source: "default" };
    } catch (error) {
      console.error("[getExchangeRate] Erreur lors de la récupération du taux:", error);
      // Fallback sécurisé en cas d'erreur
      return { rate: 130, source: "fallback" };
    }
  });

/**
 * Convertit un montant d'une devise vers une autre
 */
export const convertCurrency = createServerFn({ method: "GET" })
  .inputValidator((input) => 
    z.object({ 
      amount: z.number(),
      baseCurrency: z.string().length(3), 
      targetCurrency: z.string().length(3) 
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { amount, baseCurrency, targetCurrency } = data;
    
    const { rate, source } = await getExchangeRate({ 
      data: { baseCurrency, targetCurrency } 
    });
    
    const convertedAmount = amount * rate;
    
    return {
      originalAmount: amount,
      convertedAmount: Math.round(convertedAmount * 100) / 100, // Arrondi à 2 décimales
      rate,
      baseCurrency,
      targetCurrency,
      source,
      timestamp: new Date().toISOString(),
    };
  });

/**
 * Met à jour un taux de change (réservé aux admins)
 */
export const updateExchangeRate = createServerFn({ method: "POST" })
  .inputValidator((input) => 
    z.object({ 
      baseCurrency: z.string().length(3),
      targetCurrency: z.string().length(3),
      rate: z.number().positive(),
      validFrom: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const { requireUser } = await import("./auth.server");
    
    // Vérification que l'utilisateur est admin
    const user = await requireUser();
    if (!user.is_admin) {
      throw new Error("Seuls les administrateurs peuvent modifier les taux de change");
    }
    
    const sql = db();
    const { baseCurrency, targetCurrency, rate, validFrom } = data;
    const fromDate = validFrom ? new Date(validFrom).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    
    // Désactiver les anciens taux pour cette paire
    await sql`
      UPDATE exchange_rates 
      SET is_current = false, updated_at = now()
      WHERE base_currency = ${baseCurrency} 
        AND target_currency = ${targetCurrency}
        AND is_current = true
    `;
    
    // Insérer le nouveau taux
    const rows = (await sql`
      INSERT INTO exchange_rates (base_currency, target_currency, rate, valid_from, is_current, source)
      VALUES (${baseCurrency}, ${targetCurrency}, ${rate}, ${fromDate}::date, true, 'admin')
      RETURNING id, rate, valid_from
    `) as { id: string; rate: string; valid_from: string }[];
    
    const row = rows[0];
    if (!row) {
      throw new Error("Échec de l'insertion du taux de change");
    }
    
    return {
      id: row.id,
      rate: Number(row.rate),
      validFrom: row.valid_from,
      message: "Taux de change mis à jour avec succès",
    };
  });

/**
 * Formate un montant selon la devise
 */
export function formatCurrency(amount: number, currency: string, locale = "fr-HT"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Calcule le montant en HTG à partir d'un plan personnalisé
 */
export async function calculatePlanAmountInHTG(
  appId: string,
  planKey: string
): Promise<{
  originalAmount: number;
  currency: string;
  htgAmount: number;
  rate: number;
  label: string;
  planExists: boolean;
}> {
  const { db } = await import("./db.server");
  const sql = db();
  
  // Récupérer le plan personnalisé
  const planRows = (await sql`
    SELECT plan_key, label, amount, currency, is_active
    FROM app_plans
    WHERE app_id = ${appId} AND plan_key = ${planKey} AND is_active = true
    LIMIT 1
  `) as { plan_key: string; label: string; amount: string; currency: string; is_active: boolean }[];
  
  if (planRows.length === 0 || !planRows[0]) {
    // Plan personnalisé non trouvé, retourne null
    return {
      originalAmount: 0,
      currency: "HTG",
      htgAmount: 0,
      rate: 1,
      label: "",
      planExists: false,
    };
  }
  
  const plan = planRows[0];
  const originalAmount = Number(plan.amount);
  const currency = plan.currency;
  
  // Si la devise est déjà HTG, pas de conversion nécessaire
  if (currency === "HTG") {
    return {
      originalAmount,
      currency,
      htgAmount: originalAmount,
      rate: 1,
      label: plan.label,
      planExists: true,
    };
  }
  
  // Récupérer le taux de change
  const { rate } = await getExchangeRate({ 
    data: { baseCurrency: currency, targetCurrency: "HTG" } 
  });
  
  const htgAmount = Math.round(originalAmount * rate);
  
  return {
    originalAmount,
    currency,
    htgAmount,
    rate,
    label: plan.label,
    planExists: true,
  };
}
