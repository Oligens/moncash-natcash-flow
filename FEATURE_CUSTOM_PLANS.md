# 📦 Mise à jour Zaka Pro - Plans Personnalisés & Conversion Devises

## Résumé des modifications

Cette mise à jour permet aux développeurs de configurer des **plans de tarification personnalisés** pour leurs applications tierces, avec support multi-devises et conversion automatique en Gourdes (HTG).

---

## ✅ 1. Nouvelle structure de base de données

### Fichier: `/db/migrations/001_add_custom_plans.sql`

Deux nouvelles tables ont été ajoutées :

#### `app_plans` - Plans personnalisés par application
```sql
- id: uuid
- app_id: uuid (référence à apps)
- plan_key: text (ex: 'monthly', 'yearly', 'trial', 'premium')
- label: text (ex: 'Plan Mensuel', 'Essai 15 jours')
- amount: numeric (montant dans la devise d'origine)
- currency: text (USD, EUR, HTG, etc.)
- period: text ('day', 'week', 'month', 'year', 'once')
- description: text
- badge: text (optionnel)
- is_active: boolean
- sort_order: integer
```

#### `exchange_rates` - Taux de change
```sql
- id: uuid
- base_currency: text (ex: 'USD')
- target_currency: text (ex: 'HTG')
- rate: numeric (taux de conversion)
- source: text ('manual', 'api', 'admin')
- valid_from: date
- valid_until: date
- is_current: boolean
```

**Taux par défaut inclus :**
- 1 USD = 130 HTG
- 1 EUR = 140 HTG

---

## ✅ 2. Fonctions de conversion de devises

### Fichier: `/src/lib/currency.functions.ts`

Nouvelles fonctions exportées :

#### `getExchangeRate({ baseCurrency, targetCurrency })`
Récupère le taux de change actuel depuis la base de données (avec fallback sur des valeurs par défaut).

#### `convertCurrency({ amount, baseCurrency, targetCurrency })`
Convertit un montant d'une devise vers une autre en temps réel.

#### `updateExchangeRate({ baseCurrency, targetCurrency, rate })`
Met à jour un taux de change (réservé aux administrateurs).

#### `calculatePlanAmountInHTG(appId, planKey)`
Calcule le montant en HTG pour un plan personnalisé donné, en appliquant le taux de change approprié.

#### `formatCurrency(amount, currency, locale)`
Formate un montant selon la devise spécifiée.

---

## ✅ 3. Mise à jour du tunnel de paiement

### Fichier: `/src/lib/checkout.functions.ts`

#### Modifications de `initDemoCheckout`
- Ajout du paramètre optionnel `customPlanKey`
- Si un plan personnalisé est spécifié, le montant est récupéré via `calculatePlanAmountInHTG()`
- Le montant converti en HTG est utilisé pour la subscription
- Log détaillé dans la console serveur

#### Nouvelle fonction: `getAppPlans(appId)`
Récupère tous les plans personnalisés actifs d'une application avec :
- Montant original dans la devise configurée
- Montant converti en HTG
- Taux de change appliqué
- Badge et description

---

### Fichier: `/src/components/payment-tunnel.tsx`

#### Nouvelles fonctionnalités UI
1. **Détection automatique des plans personnalisés**
   - Si l'application a des plans personnalisés, ils sont affichés en priorité
   - Sinon, affichage des plans par défaut Zaka Pro (250 HTG/mois, 2500 HTG/an)

2. **Affichage multi-devises**
   - Pour les plans en devise étrangère : affichage du montant original + conversion
   - Exemple : `$15.00 USD → 1950 HTG`

3. **Sélection intuitive**
   - Les plans sont triés par `sort_order` puis par date de création
   - Support des badges (ex: "Populaire", "Économisez 20%")

---

## ✅ 4. Intégration côté développeur

### Comment configurer des plans personnalisés

Les développeurs peuvent maintenant insérer des plans directement en base de données :

```sql
-- Exemple pour une application Oligens-Cipher
INSERT INTO app_plans (app_id, plan_key, label, amount, currency, period, description, badge)
VALUES 
  ('uuid-de-l-app', 'trial', 'Essai 15 jours', 0, 'USD', 'once', 'Période d''essai gratuite', NULL),
  ('uuid-de-l-app', 'monthly', 'Abonnement Mensuel', 15, 'USD', 'month', 'Accès complet aux fonctionnalités', NULL),
  ('uuid-de-l-app', 'yearly', 'Abonnement Annuel', 150, 'USD', 'year', 'Économisez 2 mois', 'Meilleure offre');
```

### URL de paiement supportées

```
# Plan mensuel par défaut
/pay?apikey=sk_live_...&plan=monthly

# Plan annuel
/pay?apikey=sk_live_...&plan=yearly

# Plan personnalisé (si configuré dans app_plans)
/pay?apikey=sk_live_...&plan=trial
/pay?apikey=sk_live_...&plan=premium
```

---

## ✅ 5. Sécurité et robustesse

### Gestion des erreurs
- Try-catch dans toutes les fonctions serveur
- Fallback sécurisé sur des taux par défaut si la DB est inaccessible
- Validation stricte des paramètres avec Zod
- Logs détaillés pour le débogage

### Protection des données
- Seuls les plans `is_active = true` sont affichés
- Vérification de l'existence du plan avant initialisation du paiement
- Isolation par `app_id` (chaque application ne voit que ses plans)

---

## 📊 Exemple de flux utilisateur

1. **Développeur** configure ses plans dans `app_plans` (en USD/EUR)
2. **Utilisateur** clique sur "Passer en Pro" dans l'application tierce
3. **Tunnel de paiement** affiche les plans avec conversion HTG en temps réel
4. **Utilisateur** sélectionne un plan et voit le montant exact en HTG
5. **Paiement** MonCash/Natcash effectué en HTG (montant converti)
6. **Subscription** créée avec le montant HTG dans la table `subscriptions`

---

## 🔧 Commandes utiles

### Appliquer la migration
```bash
psql $NEON_DATABASE_URL -f db/migrations/001_add_custom_plans.sql
```

### Mettre à jour les taux de change
```sql
UPDATE exchange_rates 
SET rate = 135.50, updated_at = now()
WHERE base_currency = 'USD' AND target_currency = 'HTG' AND is_current = true;
```

### Ajouter un plan personnalisé
```sql
INSERT INTO app_plans (app_id, plan_key, label, amount, currency, period)
VALUES ('app-uuid', 'premium', 'Plan Premium', 25, 'EUR', 'month');
```

---

## 📝 Notes importantes

1. **Rétrocompatibilité** : Les anciennes subscriptions continuent de fonctionner avec les montants HTG fixes
2. **Performance** : Les taux de change sont mis en cache via la colonne `is_current`
3. **Admin** : Une interface admin pourra être ajoutée pour gérer les taux et plans sans SQL
4. **Devise par défaut** : Si aucune devise n'est spécifiée, USD est utilisé

---

## 🚀 Déploiement

1. Appliquer la migration SQL sur la base de données Neon
2. Déployer sur Vercel (`git push`)
3. Tester avec une application de test
4. Mettre à jour les taux de change régulièrement (script cron ou interface admin)

---

**Auteur** : Assistant IA  
**Date** : 2025  
**Version** : 2.0.0
