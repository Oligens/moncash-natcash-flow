/**
 * Subscription & Promo Code Management Functions
 * Gère les abonnements SaaS Zaka Pro et les codes promotionnels
 */

import { db } from './db.server';
import type { User } from '@clerk/backend';

export interface Subscription {
  id: string;
  user_id: string;
  status: 'active' | 'expired' | 'cancelled' | 'trial' | 'inactive';
  plan_type: 'free' | 'pro_monthly' | 'pro_yearly';
  start_date: Date;
  end_date: Date | null;
  trial_ends_at: Date | null;
  payment_provider: string | null;
  last_payment_amount: number | null;
  currency: string;
}

export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed_amount' | 'free_days' | 'upgrade_plan';
  discount_value: number;
  target_plan: string | null;
  duration_type: 'lifetime' | 'monthly' | 'yearly' | 'trial_days';
  duration_value: number;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  expires_at: Date | null;
}

/**
 * Vérifie si un développeur a un abonnement actif
 * Retourne null si l'abonnement est expiré/inactif
 */
export async function getDeveloperSubscription(userId: string): Promise<Subscription | null> {
  try {
    const result = await db`
      SELECT * FROM subscriptions 
      WHERE user_id = ${userId} 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    
    if (!result || result.length === 0) {
      return null;
    }

    const sub = result[0] as Subscription;
    
    // Vérifier si l'abonnement est expiré
    if (sub.end_date && new Date(sub.end_date) < new Date()) {
      // Mettre à jour le statut automatiquement
      await updateSubscriptionStatus(sub.id, 'expired');
      return { ...sub, status: 'expired' };
    }

    // Vérifier période d'essai
    if (sub.status === 'trial' && sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date()) {
      await updateSubscriptionStatus(sub.id, 'expired');
      return { ...sub, status: 'expired' };
    }

    return sub;
  } catch (error) {
    console.error('[getDeveloperSubscription] Error:', error);
    return null;
  }
}

/**
 * Middleware: Vérifie si l'API d'une application doit être suspendue
 * Retourne true si l'API est active, false si suspendue
 */
export async function isAppApiActive(apiKey: string): Promise<{ active: boolean; reason?: string }> {
  try {
    // Récupérer l'application et son propriétaire
    const appResult = await db`
      SELECT a.owner_id, a.name FROM apps a WHERE a.api_key = ${apiKey} LIMIT 1
    `;

    if (!appResult || appResult.length === 0) {
      return { active: false, reason: 'API_KEY_NOT_FOUND' };
    }

    const app = appResult[0];
    
    // Récupérer l'abonnement du développeur
    const subscription = await getDeveloperSubscription(app.owner_id);

    // Pas d'abonnement = mode gratuit limité ou inactif
    if (!subscription) {
      // Optionnel: permettre un niveau gratuit avec limitations
      return { active: true, reason: 'FREE_TIER' };
    }

    // Abonnement expiré ou annulé = suspension
    if (subscription.status === 'expired' || subscription.status === 'cancelled') {
      return { 
        active: false, 
        reason: `SUBSCRIPTION_${subscription.status.toUpperCase()}` 
      };
    }

    // Abonnement actif
    if (subscription.status === 'active' || subscription.status === 'trial') {
      return { active: true };
    }

    return { active: false, reason: 'UNKNOWN_STATUS' };
  } catch (error) {
    console.error('[isAppApiActive] Error:', error);
    // En cas d'erreur DB, on bloque par sécurité ou on laisse passer selon la politique
    return { active: false, reason: 'SYSTEM_ERROR' };
  }
}

/**
 * Valide et applique un code promotionnel
 */
export async function applyPromoCode(
  userId: string, 
  code: string
): Promise<{ success: boolean; message: string; newEndDate?: Date }> {
  try {
    // 1. Vérifier le code
    const promoResult = await db`
      SELECT * FROM promo_codes 
      WHERE code = ${code} AND is_active = TRUE
      LIMIT 1
    `;

    if (!promoResult || promoResult.length === 0) {
      return { success: false, message: 'Code promotionnel invalide ou expiré' };
    }

    const promo = promoResult[0] as PromoCode;

    // 2. Vérifier expiration du code
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return { success: false, message: 'Ce code a expiré' };
    }

    // 3. Vérifier limite d'utilisations
    if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
      return { success: false, message: 'Ce code a atteint sa limite d\'utilisations' };
    }

    // 4. Vérifier si déjà utilisé par cet utilisateur
    const existingRedemption = await db`
      SELECT id FROM promo_redemptions 
      WHERE promo_code_id = ${promo.id} AND user_id = ${userId}
      LIMIT 1
    `;

    if (existingRedemption && existingRedemption.length > 0) {
      return { success: false, message: 'Vous avez déjà utilisé ce code' };
    }

    // 5. Calculer la nouvelle date de fin
    const now = new Date();
    let newEndDate: Date;
    let newStatus = 'active';
    let newPlanType = 'pro_monthly';

    // Récupérer l'abonnement actuel s'il existe
    const currentSub = await getDeveloperSubscription(userId);
    const baseDate = currentSub?.end_date && new Date(currentSub.end_date) > now 
      ? new Date(currentSub.end_date) 
      : now;

    switch (promo.duration_type) {
      case 'trial_days':
        newEndDate = new Date(baseDate);
        newEndDate.setDate(newEndDate.getDate() + promo.duration_value);
        newStatus = 'trial';
        newPlanType = 'free';
        break;
      
      case 'monthly':
        newEndDate = new Date(baseDate);
        newEndDate.setMonth(newEndDate.getMonth() + promo.duration_value);
        break;
      
      case 'yearly':
        newEndDate = new Date(baseDate);
        newEndDate.setFullYear(newEndDate.getFullYear() + promo.duration_value);
        break;
      
      case 'lifetime':
        newEndDate = new Date('2099-12-31T23:59:59Z'); // Quasiment illimité
        break;
      
      default:
        newEndDate = new Date(baseDate);
        newEndDate.setMonth(newEndDate.getMonth() + 1);
    }

    // 6. Créer/Mettre à jour l'abonnement
    let subscriptionId: string;

    if (currentSub) {
      // Mise à jour
      await db`
        UPDATE subscriptions SET
          status = ${newStatus},
          end_date = ${newEndDate},
          plan_type = ${newPlanType},
          updated_at = NOW()
        WHERE user_id = ${userId}
        RETURNING id
      `;
      subscriptionId = currentSub.id;
    } else {
      // Création
      const newSub = await db`
        INSERT INTO subscriptions (user_id, status, plan_type, start_date, end_date)
        VALUES (${userId}, ${newStatus}, ${newPlanType}, NOW(), ${newEndDate})
        RETURNING id
      `;
      subscriptionId = newSub[0].id;
    }

    // 7. Enregistrer la redemption
    await db`
      INSERT INTO promo_redemptions (promo_code_id, user_id, subscription_id)
      VALUES (${promo.id}, ${userId}, ${subscriptionId})
    `;

    // 8. Incrémenter le compteur d'utilisations
    await db`
      UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = ${promo.id}
    `;

    return { 
      success: true, 
      message: 'Code appliqué avec succès!', 
      newEndDate 
    };
  } catch (error) {
    console.error('[applyPromoCode] Error:', error);
    return { success: false, message: 'Erreur lors de l\'application du code' };
  }
}

/**
 * Met à jour le statut d'un abonnement
 */
async function updateSubscriptionStatus(subscriptionId: string, status: string) {
  await db`
    UPDATE subscriptions SET status = ${status}, updated_at = NOW()
    WHERE id = ${subscriptionId}
  `;
}

/**
 * Crée un code promotionnel (Admin only)
 */
export async function createPromoCode(params: {
  code: string;
  description?: string;
  discount_type: PromoCode['discount_type'];
  discount_value: number;
  duration_type: PromoCode['duration_type'];
  duration_value: number;
  max_uses?: number;
  expires_at?: Date;
  target_plan?: string;
  created_by: string;
}) {
  try {
    const result = await db`
      INSERT INTO promo_codes (
        code, description, discount_type, discount_value, 
        duration_type, duration_value, max_uses, expires_at, 
        target_plan, created_by
      )
      VALUES (
        ${params.code},
        ${params.description || null},
        ${params.discount_type},
        ${params.discount_value},
        ${params.duration_type},
        ${params.duration_value},
        ${params.max_uses || null},
        ${params.expires_at || null},
        ${params.target_plan || null},
        ${params.created_by}
      )
      RETURNING *
    `;
    
    return { success: true, data: result[0] };
  } catch (error) {
    console.error('[createPromoCode] Error:', error);
    return { success: false, error: 'Code déjà existant ou erreur DB' };
  }
}

/**
 * Récupère les stats pour le dashboard Admin
 */
export async function getAdminStats() {
  try {
    const result = await db`SELECT * FROM admin_dashboard_stats LIMIT 1`;
    return result[0] || {};
  } catch (error) {
    console.error('[getAdminStats] Error:', error);
    return null;
  }
}

/**
 * Liste tous les abonnements (pour Admin Dashboard)
 */
export async function getAllSubscriptions(limit = 50, offset = 0) {
  try {
    const result = await db`
      SELECT 
        s.*,
        u.email,
        u.full_name
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return result || [];
  } catch (error) {
    console.error('[getAllSubscriptions] Error:', error);
    return [];
  }
}

/**
 * Liste tous les codes promo (pour Admin Dashboard)
 */
export async function getAllPromoCodes() {
  try {
    const result = await db`
      SELECT 
        pc.*,
        u.email as creator_email
      FROM promo_codes pc
      LEFT JOIN users u ON pc.created_by = u.id
      ORDER BY pc.created_at DESC
    `;
    return result || [];
  } catch (error) {
    console.error('[getAllPromoCodes] Error:', error);
    return [];
  }
}
