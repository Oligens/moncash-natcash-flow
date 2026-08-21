/**
 * Admin Dashboard Routes for Zaka Pro
 * Gestion des abonnements, codes promo et taux de change
 */

import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { requireAdminUser } from '~/lib/auth.server'; // À implémenter selon votre système d'auth
import { 
  getAdminStats, 
  getAllSubscriptions, 
  getAllPromoCodes,
  createPromoCode 
} from '~/lib/subscription.functions';
import { 
  getExchangeRate, 
  updateExchangeRate 
} from '~/lib/currency.functions';

/**
 * GET /admin/dashboard
 * Récupère les statistiques globales
 */
export async function loader({ request }: LoaderFunctionArgs) {
  // Vérifier que l'utilisateur est admin
  const user = await requireAdminUser(request);
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  switch (action) {
    case 'stats':
      const stats = await getAdminStats();
      return json(stats);

    case 'subscriptions':
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const subscriptions = await getAllSubscriptions(limit, offset);
      return json(subscriptions);

    case 'promo-codes':
      const promoCodes = await getAllPromoCodes();
      return json(promoCodes);

    case 'exchange-rate':
      const currency = url.searchParams.get('currency') || 'USD';
      const rate = await getExchangeRate(currency);
      return json({ currency, rate });

    default:
      return json({ 
        message: 'Admin Dashboard API',
        endpoints: [
          '?action=stats',
          '?action=subscriptions&limit=50&offset=0',
          '?action=promo-codes',
          '?action=exchange-rate&currency=USD'
        ]
      });
  }
}

/**
 * POST /admin/dashboard
 * Actions administratives : créer code promo, mettre à jour taux, etc.
 */
export async function action({ request }: ActionFunctionArgs) {
  // Vérifier que l'utilisateur est admin
  const user = await requireAdminUser(request);
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const actionType = formData.get('action');

  switch (actionType) {
    /**
     * Créer un code promotionnel
     * Required fields: code, discount_type, discount_value, duration_type, duration_value
     * Optional: description, max_uses, expires_at, target_plan
     */
    case 'create-promo-code': {
      const code = formData.get('code') as string;
      const description = formData.get('description') as string | null;
      const discount_type = formData.get('discount_type') as any;
      const discount_value = parseFloat(formData.get('discount_value') as string);
      const duration_type = formData.get('duration_type') as any;
      const duration_value = parseInt(formData.get('duration_value') as string);
      const max_uses = formData.get('max_uses') ? parseInt(formData.get('max_uses') as string) : null;
      const expires_at = formData.get('expires_at') ? new Date(formData.get('expires_at') as string) : null;
      const target_plan = formData.get('target_plan') as string | null;

      if (!code || !discount_type || !duration_type) {
        return json(
          { error: 'Champs requis manquants' },
          { status: 400 }
        );
      }

      const result = await createPromoCode({
        code,
        description,
        discount_type,
        discount_value,
        duration_type,
        duration_value,
        max_uses: max_uses || undefined,
        expires_at: expires_at || undefined,
        target_plan: target_plan || undefined,
        created_by: user.id
      });

      if (result.success) {
        return json({ success: true, data: result.data });
      } else {
        return json({ error: result.error }, { status: 400 });
      }
    }

    /**
     * Mettre à jour le taux de change
     * Required: currency, rate
     */
    case 'update-exchange-rate': {
      const currency = formData.get('currency') as string;
      const rate = parseFloat(formData.get('rate') as string);

      if (!currency || isNaN(rate)) {
        return json(
          { error: 'Devise et taux requis' },
          { status: 400 }
        );
      }

      try {
        await updateExchangeRate(currency, rate);
        return json({ success: true, currency, rate });
      } catch (error) {
        return json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
      }
    }

    /**
     * Activer/Désactiver un code promo
     * Required: promo_id, is_active
     */
    case 'toggle-promo-code': {
      const promo_id = formData.get('promo_id') as string;
      const is_active = formData.get('is_active') === 'true';

      if (!promo_id) {
        return json({ error: 'ID du code requis' }, { status: 400 });
      }

      try {
        const { db } = await import('~/lib/db.server');
        await db`
          UPDATE promo_codes SET is_active = ${is_active} WHERE id = ${promo_id}
        `;
        return json({ success: true, promo_id, is_active });
      } catch (error) {
        return json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
      }
    }

    /**
     * Prolonger manuellement un abonnement
     * Required: subscription_id, days
     */
    case 'extend-subscription': {
      const subscription_id = formData.get('subscription_id') as string;
      const days = parseInt(formData.get('days') as string);

      if (!subscription_id || isNaN(days)) {
        return json({ error: 'ID abonnement et nombre de jours requis' }, { status: 400 });
      }

      try {
        const { db } = await import('~/lib/db.server');
        
        // Récupérer l'abonnement actuel
        const [sub] = await db`SELECT end_date FROM subscriptions WHERE id = ${subscription_id}`;
        
        if (!sub) {
          return json({ error: 'Abonnement non trouvé' }, { status: 404 });
        }

        const currentDate = sub.end_date ? new Date(sub.end_date) : new Date();
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + days);

        await db`
          UPDATE subscriptions 
          SET end_date = ${newDate}, status = 'active', updated_at = NOW()
          WHERE id = ${subscription_id}
        `;

        return json({ success: true, subscription_id, new_end_date: newDate });
      } catch (error) {
        console.error('[extend-subscription] Error:', error);
        return json({ error: 'Erreur lors de la prolongation' }, { status: 500 });
      }
    }

    default:
      return json({ error: 'Action non reconnue' }, { status: 400 });
  }
}
