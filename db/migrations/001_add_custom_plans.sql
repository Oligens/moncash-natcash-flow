-- Table pour les plans personnalisés des applications tierces
-- Permet aux développeurs de définir leurs propres tarifs dans différentes devises

CREATE TABLE IF NOT EXISTS app_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  plan_key text NOT NULL, -- ex: 'monthly', 'yearly', 'trial', 'premium'
  label text NOT NULL, -- ex: 'Plan Mensuel', 'Essai 15 jours'
  amount numeric NOT NULL, -- Montant dans la devise d'origine
  currency text NOT NULL DEFAULT 'USD', -- Devise: USD, EUR, HTG, etc.
  period text NOT NULL DEFAULT 'month', -- 'day', 'week', 'month', 'year', 'once'
  description text, -- Description du plan
  badge text, -- Badge optionnel (ex: 'Populaire', 'Économisez 20%')
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(app_id, plan_key)
);

CREATE INDEX IF NOT EXISTS app_plans_app_id_idx ON app_plans (app_id);
CREATE INDEX IF NOT EXISTS app_plans_active_idx ON app_plans (app_id, is_active);

-- Table pour les taux de change (mise à jour quotidienne ou manuelle)
CREATE TABLE IF NOT EXISTS exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency text NOT NULL DEFAULT 'USD',
  target_currency text NOT NULL DEFAULT 'HTG',
  rate numeric NOT NULL,
  source text DEFAULT 'manual', -- 'manual', 'api', 'admin'
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(base_currency, target_currency, valid_from)
);

CREATE INDEX IF NOT EXISTS exchange_rates_current_idx ON exchange_rates (is_current);
CREATE INDEX IF NOT EXISTS exchange_rates_currencies_idx ON exchange_rates (base_currency, target_currency);

-- Insertion des taux de change par défaut (USD -> HTG)
-- À mettre à jour régulièrement via script ou interface admin
INSERT INTO exchange_rates (base_currency, target_currency, rate, source, valid_from)
VALUES 
  ('USD', 'HTG', 130.00, 'manual', CURRENT_DATE),
  ('EUR', 'HTG', 140.00, 'manual', CURRENT_DATE)
ON CONFLICT (base_currency, target_currency, valid_from) 
DO UPDATE SET rate = EXCLUDED.rate, updated_at = now();
