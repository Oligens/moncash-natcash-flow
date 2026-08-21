# 🎯 Feature: Abonnements SaaS & Codes Promo - Zaka Pro

## Vue d'ensemble
Cette mise à jour implémente un système complet de gestion des abonnements pour les développeurs utilisant la plateforme Zaka Pro, avec suspension automatique des APIs en cas d'expiration, et un système de codes promotionnels flexible.

---

## 📦 Nouvelles Tables de Base de Données

### 1. `subscriptions` - Abonnements Développeurs
```sql
- id: UUID (clé primaire)
- user_id: UUID (référence à users)
- status: 'active' | 'expired' | 'cancelled' | 'trial' | 'inactive'
- plan_type: 'free' | 'pro_monthly' | 'pro_yearly'
- start_date: TIMESTAMPTZ
- end_date: TIMESTAMPTZ (NULL si lifetime)
- trial_ends_at: TIMESTAMPTZ
- payment_provider: 'moncash' | 'natcash' | 'stripe'
- last_payment_amount: NUMERIC
- currency: TEXT (default 'HTG')
```

### 2. `promo_codes` - Codes Promotionnels
```sql
- id: UUID
- code: TEXT (unique)
- discount_type: 'percentage' | 'fixed_amount' | 'free_days' | 'upgrade_plan'
- discount_value: NUMERIC
- duration_type: 'lifetime' | 'monthly' | 'yearly' | 'trial_days'
- duration_value: INTEGER (jours pour trial_days)
- max_uses: INTEGER (NULL = illimité)
- current_uses: INTEGER
- is_active: BOOLEAN
- expires_at: TIMESTAMPTZ
```

### 3. `promo_redemptions` - Historique d'Utilisation
```sql
- promo_code_id: UUID
- user_id: UUID
- subscription_id: UUID
- redeemed_at: TIMESTAMPTZ
- UNIQUE(promo_code_id, user_id)
```

---

## 🔧 Nouvelles Fonctions Backend

### `src/lib/subscription.functions.ts`

| Fonction | Description |
|----------|-------------|
| `getDeveloperSubscription(userId)` | Récupère l'abonnement d'un développeur |
| `isAppApiActive(apiKey)` | **Middleware**: Vérifie si l'API doit être active |
| `applyPromoCode(userId, code)` | Valide et applique un code promo |
| `createPromoCode(params)` | Crée un code promo (Admin) |
| `getAdminStats()` | Stats pour le dashboard admin |
| `getAllSubscriptions()` | Liste tous les abonnements |
| `getAllPromoCodes()` | Liste tous les codes promo |

### `src/lib/api.middleware.ts`

| Fonction | Description |
|----------|-------------|
| `withSubscriptionCheck(args, handler)` | Wrapper pour protéger les routes API |
| `checkSubscriptionStatus(apiKey)` | Vérification simplifiée |

---

## 🚀 Middleware de Suspension Automatique

### Comment ça marche ?

Lorsqu'un appel API est fait avec une clé API :

```typescript
// Exemple dans une route API
export async function loader({ request }: LoaderFunctionArgs) {
  return withSubscriptionCheck(request, async () => {
    // Votre logique métier ici
    // Ne s'exécute que si l'abonnement est actif
  });
}
```

### Scénarios de suspension :

| Statut | Comportement | Message Retour |
|--------|-------------|----------------|
| `active` | ✅ API fonctionne normalement | - |
| `trial` | ✅ API fonctionne (période d'essai) | - |
| `expired` | ❌ API suspendue (403) | "Votre abonnement a expiré" |
| `cancelled` | ❌ API suspendue (403) | "Abonnement annulé" |
| `inactive` | ⚠️ Mode gratuit ou limité | "FREE_TIER" |

**Important** : Les clés API ne sont **jamais supprimées**. Elles redeviennent actives automatiquement dès le renouvellement de l'abonnement.

---

## 🎟️ Système de Codes Promo

### Types de codes supportés :

#### 1. Essai Gratuit (Trial Days)
```json
{
  "code": "TRIAL15",
  "discount_type": "free_days",
  "duration_type": "trial_days",
  "duration_value": 15
}
```
→ Offre 15 jours d'essai gratuit

#### 2. Abonnement Mensuel Offert
```json
{
  "code": "MONTH1",
  "discount_type": "free_days",
  "duration_type": "monthly",
  "duration_value": 1
}
```
→ Offre 1 mois d'abonnement

#### 3. Abonnement Annuel
```json
{
  "code": "YEAR2025",
  "discount_type": "free_days",
  "duration_type": "yearly",
  "duration_value": 1
}
```
→ Offre 1 an d'abonnement

#### 4. Accès à Vie (Lifetime)
```json
{
  "code": "EARLYBIRD",
  "discount_type": "free_days",
  "duration_type": "lifetime",
  "duration_value": 1
}
```
→ Accès illimité (jusqu'en 2099)

#### 5. Réduction en Pourcentage (à venir)
```json
{
  "code": "SAVE20",
  "discount_type": "percentage",
  "discount_value": 20
}
```
→ 20% de réduction sur le prochain paiement

---

## 📊 Admin Dashboard

### Route : `/admin/dashboard`

#### GET - Récupérer des données
```bash
# Stats globales
GET /admin/dashboard?action=stats

# Liste des abonnements
GET /admin/dashboard?action=subscriptions&limit=50&offset=0

# Liste des codes promo
GET /admin/dashboard?action=promo-codes

# Taux de change actuel
GET /admin/dashboard?action=exchange-rate&currency=USD
```

#### POST - Actions administratives

**Créer un code promo :**
```bash
POST /admin/dashboard
Content-Type: application/x-www-form-urlencoded

action=create-promo-code
&code=BLACKFRIDAY
&description=50% de réduction
&discount_type=percentage
&discount_value=50
&duration_type=monthly
&duration_value=1
&max_uses=100
&expires_at=2025-12-31
```

**Mettre à jour le taux de change :**
```bash
POST /admin/dashboard

action=update-exchange-rate
&currency=USD
&rate=135.50
```

**Prolonger un abonnement manuellement :**
```bash
POST /admin/dashboard

action=extend-subscription
&subscription_id=uuid-ici
&days=30
```

**Activer/Désactiver un code promo :**
```bash
POST /admin/dashboard

action=toggle-promo-code
&promo_id=uuid-ici
&is_active=false
```

---

## 🔐 Sécurité & Authentification Admin

La fonction `requireAdminUser()` doit être implémentée selon votre système d'authentification (Clerk, Supabase Auth, etc.) :

```typescript
// src/lib/auth.server.ts (exemple avec Clerk)
import { auth } from '@clerk/remix/ssr';

export async function requireAdminUser(request: Request) {
  const { userId } = await auth(request);
  if (!userId) return null;

  // Vérifier si l'utilisateur est admin (via metadata ou table separate)
  const user = await getUserById(userId);
  if (!user?.is_admin) return null;

  return user;
}
```

---

## 📝 Migration Required

Exécutez la migration SQL pour créer les tables :

```bash
psql $NEON_DATABASE_URL -f db/migrations/002_saas_subscriptions.sql
```

---

## 🧪 Exemples d'Utilisation

### 1. Créer un code promo depuis le backend
```typescript
import { createPromoCode } from '~/lib/subscription.functions';

await createPromoCode({
  code: 'WELCOME2025',
  description: 'Offre de bienvenue',
  discount_type: 'free_days',
  discount_value: 0,
  duration_type: 'trial_days',
  duration_value: 15,
  max_uses: 500,
  created_by: adminUserId
});
```

### 2. Appliquer un code promo dans un formulaire
```typescript
import { applyPromoCode } from '~/lib/subscription.functions';

const result = await applyPromoCode(userId, 'WELCOME2025');

if (result.success) {
  console.log('Nouvelle expiration:', result.newEndDate);
} else {
  console.error(result.message);
}
```

### 3. Protéger une route API
```typescript
// routes/api/v1/transactions.ts
import { withSubscriptionCheck } from '~/lib/api.middleware';

export async function loader(args: LoaderFunctionArgs) {
  return withSubscriptionCheck(args, async () => {
    // Logique métier protégée
    const transactions = await getTransactions();
    return json(transactions);
  });
}
```

---

## 🔄 Workflow Complet

```
┌─────────────────────────────────────────────────────────────┐
│                    DÉVELOPPEUR                              │
│  1. Crée un compte → statut: 'inactive'                     │
│  2. Crée une application → reçoit api_key                   │
│  3. Appelle un code promo → statut: 'trial' (15 jours)      │
│  4. Utilise l'API → ✅ Autorisé                             │
│  5. Après 15 jours → statut: 'expired'                      │
│  6. Appelle l'API → ❌ 403 Forbidden                        │
│  7. Souscrit à Pro Monthly → statut: 'active'               │
│  8. Appelle l'API → ✅ Autorisé à nouveau                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📈 Métriques & Suivi

La vue `admin_dashboard_stats` fournit :
- `total_users` : Nombre total d'utilisateurs
- `active_subscriptions` : Abonnements actifs
- `total_apps` : Applications créées
- `total_revenue_htg` : Revenus totaux en HTG
- `active_promos` : Codes promo actifs

---

## ⚠️ Notes Importantes

1. **Suspension réversible** : La suspension n'est pas destructive. Les clés API restent valides.
2. **Grace period** : Vous pouvez ajouter une période de grâce en modifiant `isAppApiActive()`.
3. **Free tier** : Par défaut, sans abonnement, l'API retourne `FREE_TIER` (autorisé). Personnalisez selon votre modèle économique.
4. **Timezone** : Toutes les dates sont en UTC (`TIMESTAMPTZ`).
5. **Cascade delete** : Si un utilisateur est supprimé, ses abonnements et redemptions sont supprimés (CASCADE).

---

## 🚀 Prochaines Étapes Recommandées

1. [ ] Implémenter l'interface UI du Dashboard Admin
2. [ ] Ajouter un webhook pour les paiements MonCash/NatCash
3. [ ] Mettre en place des emails de rappel avant expiration
4. [ ] Créer un système de factures/invoices
5. [ ] Ajouter des webhooks Stripe pour les paiements internationaux
6. [ ] Implémenter les réductions percentage/fixed_amount

---

**Document créé le** : 2025-10-27  
**Version** : 1.0.0  
**Auteur** : Zaka Pro Team
