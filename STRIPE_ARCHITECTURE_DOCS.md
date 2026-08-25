# Architecture de Paiement Zaka Pro - Style Stripe

## 🎯 Vue d'ensemble

Zaka Pro implémente désormais une architecture de paiement sécurisée inspirée de **Stripe Checkout**, adaptée aux paiements mobiles haïtiens (MonCash & Natcash) avec validation automatique via **Zaka Relay**.

---

## 📐 Flux de Paiement Complet

### Étape 1: Initialisation de la Session (Backend)

**Qui:** Application cliente (ex: Oligens-Cipher)  
**Comment:** Requête POST sécurisée au backend Zaka  
**Endpoint:** `/api/public/v1/checkout/init`

```bash
curl -X POST https://zakaproht.vercel.app/api/public/v1/checkout/init \
  -H "x-api-key: sk_live_votre_cle_secrete" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_12345",
    "account_name": "Jean Baptiste",
    "user_phone": "50937112233",
    "provider": "moncash",
    "plan_id": "uuid-du-plan",
    "plan_type": "monthly"
  }'
```

**Réponse:**
```json
{
  "subscription_id": "abc123-def456-ghi789",
  "app": "Oligens-Cipher",
  "amount": 1950,
  "status": "pending",
  "provider": "moncash",
  "created_at": "2025-01-XX"T14:30:00Z"
}
```

**Ce qui se passe en backend:**
1. ✅ Vérification de la clé API (`x-api-key`) via `requireActiveApiApp()`
2. ✅ Récupération du plan personnalisé dans `app_plans` (montant + devise)
3. ✅ Conversion automatique en HTG via le taux du jour (`exchange_rates`)
4. ✅ Création d'une session `pending` dans `subscriptions` avec:
   - `amount`: Montant en HTG (ex: 1950 HTG)
   - `source_amount`: Montant original (ex: 15 USD)
   - `source_currency`: Devise originale (ex: USD)
   - `exchange_rate`: Taux utilisé (ex: 130.00)
   - `expires_at`: Calculé selon la période (mois/année)

---

### Étape 2: Redirection vers Tunnel de Paiement

**Qui:** Utilisateur final  
**Comment:** Redirection HTTP depuis l'app cliente  
**URL:** `https://zakaproht.vercel.app/pay?session_id=abc123...`

> ⚠️ **Sécurité:** La clé API n'est JAMAIS exposée dans l'URL. Seule la `session_id` est transmise.

**Interface utilisateur:**
- Logo et nom de l'application cliente
- Sélection du provider (MonCash ou Natcash)
- QR Code dynamique pour paiement rapide
- Instructions étape par étape
- Numéro marchand officiel
- Montant exact en HTG à envoyer

---

### Étape 3: Paiement Mobile par l'Utilisateur

**Qui:** Utilisateur final avec son téléphone  
**Action:** Envoi d'argent via MonCash/Natcash

**Exemple de SMS reçu par l'utilisateur:**
```
MonCash: Vous avez envoyé 1950 HTG à [MARCHAND]. 
Réf: MC123456789. Solde: 500 HTG.
```

---

### Étape 4: Interception par Zaka Relay (Mobile App)

**Qui:** Application Android **Zaka Relay** installée sur le téléphone du marchand  
**Déclencheur:** Réception du SMS de confirmation MonCash/Natcash

**Fonctionnement:**
1. 📱 Zaka Relay écoute les SMS entrants
2. 🔍 Filtre par expéditeur autorisé (`MonCash`, `Natcash`, etc.)
3. 🧠 Parse le SMS avec regex intelligentes:
   - Extraction du montant: `1950`
   - Extraction du nom: `[MARCHAND]`
   - Extraction de la référence: `MC123456789`
4. 📡 Envoie un webhook au serveur Zaka

**Webhook envoyé:**
```bash
POST https://zakaproht.vercel.app/api/public/webhook/sms
x-api-key: sk_live_votre_cle

{
  "message": "MonCash: Vous avez envoyé 1950 HTG à [MARCHAND]. Réf: MC123456789...",
  "sender": "+50937112233",
  "received_at": "2025-01-XXT14:35:00Z"
}
```

---

### Étape 5: Validation Automatique et Activation

**Qui:** Serveur Zaka (webhook handler)  
**Endpoint:** `/api/public/webhook/sms`

**Algorithme de matching:**
```typescript
// 1. Filtrer les abonnements pending avec le MÊME montant
const candidates = subscriptions.where({
  app_id: app.id,
  status: 'pending',
  amount: 1950 // montant extrait du SMS
});

// 2. Matching par nom exact (ou partiel si strict=false)
const match = candidates.find(c => 
  namesMatch(c.account_name, extractedName, strict=true)
);

// 3. Ou matching par numéro de téléphone
if (!match && senderPhone) {
  match = candidates.find(c => 
    c.user_phone?.endsWith(senderPhone.slice(-8))
  );
}
```

**Si correspondance trouvée:**
```sql
UPDATE subscriptions SET
  status = 'active',
  expires_at = NOW() + INTERVAL '1 month', -- ou 1 year
  reference = 'MC123456789',
  user_phone = '+50937112233'
WHERE id = 'abc123-def456-ghi789';
```

**Logs enregistrés:**
- ✅ `relay_logs`: Statut de la requête webhook
- ✅ `sms_logs`: Détails du parsing et matching
- ✅ Subscription mise à jour avec `matched_subscription_id`

**Réponse à Zaka Relay:**
```json
{
  "matched": true,
  "subscription_id": "abc123-def456-ghi789",
  "status": "active",
  "reference": "MC123456789",
  "expires_at": "2025-02-XXT14:35:00Z"
}
```

---

### Étape 6: Confirmation Utilisateur

**Qui:** Utilisateur final sur le tunnel de paiement  
**Mécanisme:** Polling automatique toutes les 5 secondes

**Quand statut = `active`:**
- ✅ Message de confirmation affiché
- ✅ Badge vert "Paiement confirmé"
- ✅ Référence de transaction affichée
- ✅ Bouton "Fermer" activé
- ✅ Redirection optionnelle vers l'app cliente

---

## 🗄️ Schéma de Base de Données

### Table `subscriptions` (Sessions de Paiement)

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  app_id UUID REFERENCES apps(id),           -- Application cliente
  user_id UUID REFERENCES users(id),         -- Utilisateur final
  user_phone TEXT,                           -- Téléphone payeur
  account_name TEXT,                         -- Nom compte MonCash/Natcash
  provider TEXT,                             -- 'moncash' ou 'natcash'
  
  -- Montants et conversion
  amount NUMERIC,                            -- Montant en HTG (après conversion)
  source_amount NUMERIC,                     -- Montant original (ex: 15 USD)
  source_currency TEXT DEFAULT 'USD',        -- Devise originale
  exchange_rate NUMERIC DEFAULT 1.0,         -- Taux utilisé (ex: 130.00)
  
  -- Plan et période
  plan_id UUID REFERENCES app_plans(id),     -- Plan personnalisé
  plan_type TEXT,                            -- 'monthly', 'yearly', etc.
  
  -- Statut et dates
  status TEXT DEFAULT 'pending',             -- pending → active
  expires_at TIMESTAMPTZ,                    -- Fin d'abonnement calculée
  reference TEXT,                            -- Réf. transaction (MC123...)
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table `app_plans` (Plans Personnalisés)

```sql
CREATE TABLE app_plans (
  id UUID PRIMARY KEY,
  app_id UUID REFERENCES apps(id),           -- Application cliente
  plan_key TEXT,                             -- 'monthly', 'yearly', 'trial'
  label TEXT,                                -- 'Plan Mensuel'
  amount NUMERIC,                            -- 15.00
  currency TEXT DEFAULT 'USD',               -- USD, EUR, HTG, etc.
  period TEXT DEFAULT 'month',               -- day, week, month, year
  description TEXT,
  badge TEXT,                                -- 'Populaire', '-20%'
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(app_id, plan_key)                   -- Unique PAR application
);
```

### Table `exchange_rates` (Taux de Change)

```sql
CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY,
  base_currency TEXT,                        -- 'USD'
  target_currency TEXT DEFAULT 'HTG',        -- 'HTG'
  rate NUMERIC NOT NULL,                     -- 130.00
  source TEXT DEFAULT 'manual',              -- 'manual', 'api', 'admin'
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_until DATE,
  is_current BOOLEAN DEFAULT true,
  UNIQUE(base_currency, target_currency, valid_from)
);
```

### Tables de Logs (Débogage)

```sql
-- Logs des webhooks Zaka Relay
CREATE TABLE relay_logs (
  id UUID PRIMARY KEY,
  app_id UUID REFERENCES apps(id),
  raw_content TEXT,                          -- SMS brut
  sender TEXT,                               -- Expéditeur
  status TEXT,                               -- success, failed, rejected
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logs détaillés du parsing SMS
CREATE TABLE sms_logs (
  id UUID PRIMARY KEY,
  app_id UUID REFERENCES apps(id),
  raw_content TEXT,
  sender_phone TEXT,
  status TEXT,                               -- matched, unmatched, rejected
  reason TEXT,                               -- Pourquoi échec/succès
  amount_detected NUMERIC,                   -- Montant extrait
  sender_name TEXT,                          -- Nom extrait
  reference TEXT,                            -- Référence transaction
  matched_subscription_id UUID REFERENCES subscriptions(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔒 Sécurité et Bonnes Pratiques

### 1. Clés API Jamais Exposées

❌ **MAIS:**
```
/pay?api_key=sk_live_secret123&plan=pro
```

✅ **CORRECT:**
```javascript
// Backend génère la session
const session = await createCheckoutSession({ apiKey, plan });

// Redirection propre
res.redirect(`https://zakaproht.vercel.app/pay?session_id=${session.id}`);
```

### 2. Validation Stricte des Webhooks

```typescript
// Middleware de vérification
const access = await requireActiveApiApp(apiKey);
if (!access.app) return 401;

// Whitelist des expéditeurs SMS
if (!isSenderAllowed(sender, app.sender_whitelist)) {
  return { matched: false, reason: "Expéditeur non autorisé" };
}
```

### 3. Logs Complets pour Audit

Toutes les opérations sont journalisées:
- Requêtes API (`relay_logs`)
- SMS analysés (`sms_logs`)
- Changements de statut (`subscriptions.updated_at`)

---

## 🧪 Tests et Développement

### Clé API Placeholder

Pour tester en développement sans créer de compte:

```bash
# Utiliser la clé de démo
curl -X POST https://zakaproht.vercel.app/api/public/v1/checkout/init \
  -H "x-api-key: sk_live_placeholder" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "account_name": "Test User",
    "provider": "moncash",
    "plan_type": "pro"
  }'
```

**Configuration automatique:**
- Merchant: `Demo Merchant (Placeholder)`
- Plans: Pro ($15 USD → 1950 HTG)
- Taux: 1 USD = 130 HTG

### Simulation de Webhook

```bash
curl -X POST https://zakaproht.vercel.app/api/public/webhook/sms \
  -H "x-api-key: sk_live_placeholder" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "MonCash: Vous avez envoyé 1950 HTG à Demo Merchant. Réf: MC987654321",
    "sender": "+50937112233",
    "received_at": "2025-01-XXT14:35:00Z"
  }'
```

---

## 📊 Dashboard Admin

### Métriques Disponibles

Via la vue `admin_dashboard_stats`:

```sql
SELECT * FROM admin_dashboard_stats;
```

Résultat:
```
total_users: 150
active_subscriptions: 42
total_apps: 12
total_revenue_htg: 125000.00
active_promos: 5
```

### Gestion des Codes Promo

Création via API admin:
```typescript
await createPromoCode({
  code: 'LAUNCH50',
  discount_type: 'percentage',
  discount_value: 50,
  duration_type: 'monthly',
  duration_value: 3, // 3 mois à -50%
  max_uses: 100,
  expires_at: new Date('2025-12-31')
});
```

---

## 🚀 Déploiement et Maintenance

### 1. Appliquer les Migrations

```bash
psql $NEON_DATABASE_URL -f db/migrations/003_production_fixes.sql
```

### 2. Configurer les Variables d'Environnement (Vercel)

```env
NEON_DATABASE_URL=postgres://...
ADMIN_EMAIL=cleefolig@gmail.com
ADMIN_PASSWORD=votre_mot_de_passe_admin
NODE_ENV=production
```

### 3. Mettre à Jour les Taux de Change Quotidiennement

Script cron ou interface admin:
```typescript
await updateExchangeRate({
  currency: 'USD',
  rateToHtg: 132.50,
  effectiveOn: '2025-01-XX'
});
```

### 4. Surveiller les Logs

```sql
-- Derniers webhooks reçus
SELECT * FROM relay_logs ORDER BY created_at DESC LIMIT 20;

-- SMS non matchés (à investiguer)
SELECT * FROM sms_logs WHERE status = 'unmatched' ORDER BY created_at DESC;
```

---

## 📞 Support et Débogage

### Erreurs Courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `Clé API invalide` | Clé absente ou expirée | Vérifier `x-api-key` dans headers |
| `Plan inconnu` | `plan_id` ou `plan_type` incorrect | Vérifier les plans dans `app_plans` |
| `Aucun abonnement correspondant` | Montant ou nom ne match pas | Ajuster `strict_name_match` dans app settings |
| `Expéditeur non autorisé` | SMS hors whitelist | Ajouter expéditeur dans `sender_whitelist` |

### Commandes Utiles

```sql
-- Voir toutes les sessions pending
SELECT * FROM subscriptions WHERE status = 'pending' ORDER BY created_at DESC;

-- Activer manuellement une subscription
UPDATE subscriptions SET status = 'active', expires_at = NOW() + INTERVAL '1 month'
WHERE id = 'uuid-de-la-session';

-- Nettoyer les anciennes sessions expirées
DELETE FROM subscriptions WHERE status = 'pending' AND created_at < NOW() - INTERVAL '24 hours';
```

---

## ✅ Checklist de Production

- [ ] Migration SQL appliquée sur Neon
- [ ] Clés API générées pour chaque application cliente
- [ ] Plans personnalisés configurés dans `app_plans`
- [ ] Taux de change à jour dans `exchange_rates`
- [ ] Zaka Relay installé et configuré sur le téléphone marchand
- [ ] Webhooks testés en environnement staging
- [ ] Logs activés et surveillés
- [ ] Variables d'environnement Vercel configurées
- [ ] SSL/TLS activé (automatique avec Vercel)

---

**Document généré:** 2025-01-XX  
**Version:** 1.0.0  
**Contact:** cleefolig@gmail.com
