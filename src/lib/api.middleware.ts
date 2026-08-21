/**
 * API Middleware for Subscription Verification
 * Middleware pour vérifier les abonnements avant d'autoriser les appels API
 */

import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { isAppApiActive } from '~/lib/subscription.functions';

/**
 * Middleware pour protéger les routes API des développeurs
 * À utiliser dans les loaders/actions des routes API publiques
 * 
 * Exemple d'utilisation:
 * export async function loader(args: LoaderFunctionArgs) {
 *   return withSubscriptionCheck(args, async () => {
 *     // Votre logique API ici
 *   });
 * }
 */
export async function withSubscriptionCheck<T>(
  args: LoaderFunctionArgs | ActionFunctionArgs,
  handler: () => Promise<T>
): Promise<Response | T> {
  try {
    const { request } = args;
    const url = new URL(request.url);
    
    // Récupérer l'API Key depuis les headers ou query params
    const apiKey = 
      request.headers.get('X-API-Key') ||
      request.headers.get('Authorization')?.replace('Bearer ', '') ||
      url.searchParams.get('apikey') ||
      url.searchParams.get('api_key') ||
      url.searchParams.get('key');

    if (!apiKey) {
      return json(
        { error: 'API_KEY_REQUIRED', message: 'Clé API requise pour accéder à cette ressource' },
        { status: 401 }
      );
    }

    // Vérifier le statut de l'abonnement
    const subscriptionStatus = await isAppApiActive(apiKey);

    if (!subscriptionStatus.active) {
      const statusCode = subscriptionStatus.reason === 'API_KEY_NOT_FOUND' ? 404 : 403;
      
      let message = 'Accès refusé';
      switch (subscriptionStatus.reason) {
        case 'API_KEY_NOT_FOUND':
          message = 'Clé API invalide ou inexistante';
          break;
        case 'SUBSCRIPTION_EXPIRED':
          message = 'Votre abonnement Zaka Pro a expiré. Veuillez renouveler pour réactiver votre API.';
          break;
        case 'SUBSCRIPTION_CANCELLED':
          message = 'Votre abonnement a été annulé. Réabonnez-vous pour continuer à utiliser l\'API.';
          break;
        case 'SYSTEM_ERROR':
          message = 'Erreur système temporaire. Réessayez plus tard.';
          break;
      }

      return json(
        { 
          error: subscriptionStatus.reason, 
          message,
          help_url: '/dashboard/billing' 
        },
        { status: statusCode }
      );
    }

    // Abonnement actif, on exécute le handler
    return await handler();
  } catch (error) {
    console.error('[withSubscriptionCheck] Unexpected error:', error);
    return json(
      { error: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}

/**
 * Middleware simplifié pour les routes qui ont juste besoin de vérifier sans bloquer
 * Retourne un objet avec isValid et reason pour gestion manuelle
 */
export async function checkSubscriptionStatus(apiKey: string): Promise<{
  isValid: boolean;
  reason?: string;
  tier?: string;
}> {
  const result = await isAppApiActive(apiKey);
  
  return {
    isValid: result.active,
    reason: result.reason,
    tier: result.reason === 'FREE_TIER' ? 'free' : 'pro'
  };
}
