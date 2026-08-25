/**
 * SNIPPET D'INTÉGRATION ZAKA - PRÊT À L'EMPLOI
 * 
 * Copiez-collez ce code dans votre application (ex: Oligens-Cipher)
 * pour intégrer le paiement Zaka en moins de 5 minutes.
 * 
 * Auteur: Zaka Pro Team
 * Documentation: https://zakaproht.vercel.app/docs
 */

import React, { useState } from 'react';

// ============================================================================
// 1. CONFIGURATION (À REMPLACER PAR VOS VALEURS)
// ============================================================================

const ZAKA_CONFIG = {
  // Votre clé API Zaka (récupérée depuis votre dashboard Zaka Pro)
  API_KEY: 'sk_live_placeholder', // Remplacez par votre vraie clé
  
  // URL de base de l'API Zaka
  BASE_URL: 'https://zakaproht.vercel.app',
  
  // ID de l'utilisateur connecté (à récupérer depuis votre système d'auth)
  // Ex: user.id, auth.userId, etc.
};

// ============================================================================
// 2. COMPOSANT BOUTON DE PAIEMENT ZAKA
// ============================================================================

interface ZakaPaymentButtonProps {
  planKey: string;           // Ex: 'pro', 'enterprise', 'monthly'
  userId: string;            // ID de l'utilisateur connecté
  apiKey?: string;           // Optionnel : override de la clé API
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
  children?: React.ReactNode;
}

export const ZakaPaymentButton: React.FC<ZakaPaymentButtonProps> = ({
  planKey,
  userId,
  apiKey = ZAKA_CONFIG.API_KEY,
  onSuccess,
  onError,
  children,
}) => {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);
    
    try {
      // ÉTAPE 1: Créer une session de paiement sécurisée via le backend Zaka
      const response = await fetch(`${ZAKA_CONFIG.BASE_URL}/api/payment/create-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey, // Clé API transmise de manière sécurisée
        },
        body: JSON.stringify({
          plan_key: planKey,
          user_id: userId,
          currency: 'USD', // Ou 'HTG', 'EUR', etc.
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Échec de création de session');
      }

      const session = await response.json();

      // ÉTAPE 2: Rediriger vers le Hub de paiement Zaka
      // L'URL ne contient PAS de clé API visible (sécurisé)
      const paymentUrl = `${ZAKA_CONFIG.BASE_URL}/pay?session_id=${session.session_id}`;
      
      // Option A: Redirection directe
      window.location.href = paymentUrl;
      
      // Option B: Ouvrir dans une popup/modal (décommenter si préféré)
      // window.open(paymentUrl, '_blank', 'width=600,height=700');

      onSuccess?.(session);
      
    } catch (error) {
      console.error('Erreur paiement Zaka:', error);
      onError?.(error as Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePayment}
      disabled={loading}
      className="zaka-payment-btn"
      style={{
        padding: '12px 24px',
        backgroundColor: loading ? '#ccc' : '#6366f1',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: '16px',
        fontWeight: '600',
      }}
    >
      {loading ? 'Traitement...' : children || `Payer le plan ${planKey}`}
    </button>
  );
};

// ============================================================================
// 3. FONCTION DE VÉRIFICATION DU STATUT D'ABONNEMENT
// ============================================================================

/**
 * Vérifie le statut de l'abonnement d'un utilisateur via l'API Zaka
 * @param userId - ID de l'utilisateur
 * @param apiKey - Clé API Zaka
 * @returns Statut de l'abonnement et détails du plan
 */
export const checkSubscriptionStatus = async (
  userId: string,
  apiKey: string = ZAKA_CONFIG.API_KEY
): Promise<{
  isActive: boolean;
  planKey?: string;
  expiresAt?: string;
  message?: string;
}> => {
  try {
    const response = await fetch(`${ZAKA_CONFIG.BASE_URL}/api/subscription/status`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'user-id': userId,
      },
    });

    if (!response.ok) {
      return { isActive: false, message: 'Erreur lors de la vérification' };
    }

    const data = await response.json();
    
    return {
      isActive: data.status === 'active',
      planKey: data.plan_key,
      expiresAt: data.expires_at,
      message: data.message,
    };
  } catch (error) {
    console.error('Erreur vérification abonnement:', error);
    return { isActive: false, message: (error as Error).message };
  }
};

// ============================================================================
// 4. EXEMPLE D'UTILISATION DANS VOTRE APPLICATION
// ============================================================================

/**
 * EXEMPLE 1: Bouton simple dans une page de pricing
 */
export const PricingPageExample = () => {
  const currentUserId = 'user_123'; // Récupéré depuis votre auth

  return (
    <div className="pricing-cards">
      {/* Carte Plan PRO */}
      <div className="card">
        <h3>Plan Pro</h3>
        <p>$15 USD / mois</p>
        <ul>
          <li>✓ Fonctionnalités avancées</li>
          <li>✓ Support prioritaire</li>
          <li>✓ API illimitée</li>
        </ul>
        
        <ZakaPaymentButton
          planKey="pro"
          userId={currentUserId}
          onSuccess={(session) => console.log('Session créée:', session)}
          onError={(error) => console.error('Erreur:', error.message)}
        >
          Choisir le Plan Pro
        </ZakaPaymentButton>
      </div>

      {/* Carte Plan Entreprise */}
      <div className="card">
        <h3>Plan Entreprise</h3>
        <p>$50 USD / mois</p>
        <ul>
          <li>✓ Tout du Plan Pro</li>
          <li>✓ Analytics avancés</li>
          <li>✓ SLA garanti</li>
        </ul>
        
        <ZakaPaymentButton
          planKey="enterprise"
          userId={currentUserId}
        >
          Choisir le Plan Entreprise
        </ZakaPaymentButton>
      </div>
    </div>
  );
};

/**
 * EXEMPLE 2: Vérification du statut avant d'accéder à une fonctionnalité premium
 */
export const ProtectedFeatureExample = () => {
  const currentUserId = 'user_123';
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  React.useEffect(() => {
    checkSubscriptionStatus(currentUserId).then((result) => {
      setHasAccess(result.isActive);
    });
  }, [currentUserId]);

  if (hasAccess === null) return <div>Chargement...</div>;
  
  if (!hasAccess) {
    return (
      <div className="locked-feature">
        <p>Cette fonctionnalité nécessite un abonnement Pro</p>
        <ZakaPaymentButton planKey="pro" userId={currentUserId}>
          Débloquer maintenant
        </ZakaPaymentButton>
      </div>
    );
  }

  return (
    <div className="premium-feature">
      <h3>🎉 Fonctionnalité Premium Débloquée!</h3>
      {/* Contenu premium ici */}
    </div>
  );
};

// ============================================================================
// 5. BACKEND NODE.JS/EXPRESS (OPTIONNEL - POUR VOTRE SERVEUR)
// ============================================================================

/**
 * EXEMPLE DE CODE BACKEND (Node.js + Express)
 * À placer dans votre propre serveur si vous avez un backend
 * 
 * npm install express cors
 */

/*
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const ZAKA_API_KEY = 'sk_live_placeholder'; // Votre clé Zaka
const ZAKA_BASE_URL = 'https://zakaproht.vercel.app';

// Route: Créer une session de paiement
app.post('/api/create-payment-session', async (req, res) => {
  const { plan_key, user_id } = req.body;
  
  try {
    const response = await fetch(`${ZAKA_BASE_URL}/api/payment/create-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ZAKA_API_KEY,
      },
      body: JSON.stringify({ plan_key, user_id }),
    });
    
    const session = await response.json();
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Échec création session' });
  }
});

// Route: Webhook de confirmation (appelé par Zaka Relay après paiement)
app.post('/api/payment-webhook', async (req, res) => {
  const { user_id, plan_key, status } = req.body;
  
  if (status === 'active') {
    // Mettre à jour votre base de données
    // Ex: await db.users.update({ id: user_id, subscription: 'active' });
    console.log(`Paiement confirmé pour ${user_id} - Plan: ${plan_key}`);
  }
  
  res.json({ received: true });
});

app.listen(3001, () => {
  console.log('Serveur de paiement démarré sur le port 3001');
});
*/

export default ZakaPaymentButton;
