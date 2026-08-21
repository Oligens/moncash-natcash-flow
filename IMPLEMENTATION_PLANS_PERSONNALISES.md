# 🎯 Plans Personnalisés Multi-Devises - Guide d'Implémentation

## Vue d'ensemble

Cette fonctionnalité permet aux développeurs utilisant Zaka Pro de configurer leurs propres plans tarifaires personnalisés pour leurs applications clientes, avec support multi-devises et conversion automatique en Gourdes (HTG) lors du paiement.

---

## 📁 Fichiers Créés/Modifiés

### 1. `src/lib/app-plans.functions.ts` (NOUVEAU)
Fichier contenant toutes les fonctions serveur pour la gestion des plans personnalisés :

#### Fonctions exportées :
- **`getAppPlans`** : Récupère tous les plans personnalisés d'une application
- **`createAppPlan`** : Crée un nouveau plan personnalisé
- **`updateAppPlan`** : Met à jour un plan existant
- **`deleteAppPlan`** : Désactive un plan (suppression logique)
- **`getExchangeRates`** : Récupère les taux de change actuels
- **`updateExchangeRate`** : Met à jour un taux de change (admin uniquement)

### 2. `src/routes/_authenticated/apps.$appId.tsx` (MODIFIÉ)
Mise à jour de la page de détail d'application avec une nouvelle section dans l'onglet "Paramètres avancés".

---

## 🔧 Comment Utiliser

### Pour les Développeurs (Interface Zaka Pro)

1. **Accédez à votre application** dans le dashboard Zaka Pro
2. **Onglet "Paramètres avancés"** → Section "Plans de tarification personnalisés"
3. **Ajoutez un plan** :
   - **Clé du plan** : Identifiant unique (ex: `premium`, `essai`, `enterprise`)
   - **Nom du plan** : Nom affiché aux utilisateurs (ex: "Plan Premium")
   - **Période** : Essai, Mensuel, Annuel ou Personnalisé
   - **Montant** : Prix dans la devise choisie (ex: 15.00)
   - **Devise** : USD, EUR, HTG, CAD
   - **Description** : Avantages du plan (optionnel)

4. **Visualisez les plans configurés** avec :
   - Affichage du montant original + équivalent HTG (ex: `15 USD (~1950 HTG)`)
   - Badge de statut (Actif/Inactif)
   - Boutons Activer/Désactiver et Supprimer

5. **Consultez les taux de change actuels** en bas de section

---

## 🔗 Intégration dans le Tunnel de Paiement

### URL de paiement avec plan personnalisé

```
https://zakaproht.vercel.app/pay?apikey=sk_live_...&plan=premium
```

Le système va :
1. Résoudre l'application via la clé API
2. Chercher le plan `premium` dans `app_plans`
3. Récupérer le montant et la devise configurés
4. Consulter le taux de change du jour dans `exchange_rates`
5. Calculer le montant HTG : `montant * taux_de_change`
6. Afficher le montant converti dans le tunnel MonCash/Natcash

### Exemple de Conversion

| Devise | Montant | Taux du jour | Montant HTG |
|--------|---------|--------------|-------------|
| USD    | $15     | 130.00       | 1950 HTG    |
| EUR    | €20     | 140.00       | 2800 HTG    |
| CAD    | $25     | 95.50        | 2388 HTG    |

---

## 🗄️ Structure de Base de Données

### Table `app_plans`
```sql
CREATE TABLE app_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id),
  plan_key text NOT NULL,              -- ex: 'premium', 'essai'
  name text NOT NULL,                  -- ex: 'Plan Premium'
  amount numeric(12,2) NOT NULL,       -- ex: 15.00
  currency char(3) NOT NULL,           -- ex: 'USD', 'EUR'
  period text NOT NULL DEFAULT 'custom', -- 'trial', 'monthly', 'yearly', 'custom'
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, plan_key)
);
```

### Table `exchange_rates`
```sql
CREATE TABLE exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency char(3) NOT NULL,           -- ex: 'USD', 'EUR'
  rate_to_htg numeric(14,6) NOT NULL,  -- ex: 130.000000
  effective_on date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (currency, effective_on)
);
```

---

## 📋 Migration Requise

Avant déploiement, exécutez cette migration SQL sur votre base Neon PostgreSQL :

```sql
-- Vérifier que les tables existent (déjà présentes dans schema.sql)
-- Sinon, exécutez :
psql $NEON_DATABASE_URL -f db/schema.sql

-- Insérer des taux de change par défaut (à ajuster selon le marché)
INSERT INTO exchange_rates (currency, rate_to_htg, source) VALUES
  ('USD', 130.00, 'initial'),
  ('EUR', 140.00, 'initial'),
  ('CAD', 95.50, 'initial')
ON CONFLICT (currency, effective_on) DO NOTHING;
```

---

## 🔐 Sécurité & Permissions

- **Isolation multi-tenant** : Chaque développeur ne voit que ses propres applications
- **Vérification de propriété** : Toutes les opérations vérifient `owner_id`
- **Taux de change** : Réservé aux administrateurs (`role = 'admin'` ou email `@zaka.ht`)
- **Suppression logique** : Les plans sont désactivés (`active = false`) plutôt que supprimés

---

## 🧪 Tests Recommandés

1. **Création de plan** :
   ```bash
   # Via l'interface Zaka Pro
   - Clé: premium, Nom: Plan Premium, Montant: 15, Devise: USD
   - Vérifier l'affichage: "15 USD (~1950 HTG)"
   ```

2. **Conversion HTG** :
   ```bash
   # Modifier le taux USD dans l'admin
   - Nouveau taux: 135.00
   - Vérifier que le plan affiche maintenant: "15 USD (~2025 HTG)"
   ```

3. **Tunnel de paiement** :
   ```bash
   # Accéder à l'URL avec plan personnalisé
   /pay?apikey=sk_live_...&plan=premium
   
   # Vérifier que le montant HTG est correct dans le récapitulatif
   ```

---

## 🚀 Déploiement

1. **Appliquer la migration SQL** (si nécessaire)
2. **Insérer les taux de change initiaux**
3. **Push vers GitHub** : ✅ Déjà effectué
4. **Déploiement Vercel** : Automatique après push
5. **Tester l'interface** : Dashboard → Application → Paramètres avancés

---

## 📞 Support

Pour toute question ou problème :
- Vérifiez les logs Vercel en cas d'erreur
- Consultez la console navigateur pour les erreurs client
- Assurez-vous que `NEON_DATABASE_URL` est configurée dans Vercel
- Vérifiez que les tables `app_plans` et `exchange_rates` existent

---

**Dernière mise à jour** : Août 2025  
**Auteur** : Oligens  
**Version** : 1.0.0
