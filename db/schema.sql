-- Schéma Zaka sur Neon (PostgreSQL). Idempotent.
-- La sécurité est appliquée côté serveur (server functions + routes API), pas par RLS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text,
  google_sub text UNIQUE,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_idx ON users (google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  api_key text NOT NULL UNIQUE DEFAULT ('sk_live_' || replace(gen_random_uuid()::text, '-', '')),
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  moncash_number text,
  natcash_number text,
  qr_image_url text,
  sender_whitelist text[] NOT NULL DEFAULT ARRAY['MonCash','Digicel','Natcash','Natcom'],
  amount_regex text NOT NULL DEFAULT '(?:HTG|Gdes?|Gourdes?)\s*([\d.,]+)|([\d.,]+)\s*(?:HTG|Gdes?|Gourdes?)',
  name_regex text NOT NULL DEFAULT '(?:de|from|soti nan|par|sent by)\s+([A-Za-z\u00C0-\u00FF''\-]+(?:\s+[A-Za-z\u00C0-\u00FF''\-]+){0,3})',
  reference_regex text NOT NULL DEFAULT '(?:Ref|Reference|Transaction ID|ID)\s*[:#]?\s*([A-Za-z0-9]{4,})',
  strict_name_match boolean NOT NULL DEFAULT true,
  relay_last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  user_phone text,
  account_name text NOT NULL,
  provider text NOT NULL DEFAULT 'moncash',
  plan_type text NOT NULL DEFAULT 'monthly',
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS subscriptions_app_status_idx ON subscriptions (app_id, status);

CREATE TABLE IF NOT EXISTS app_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  plan_key text NOT NULL,
  name text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL CHECK (currency = upper(currency) AND currency ~ '^[A-Z]{3}$'),
  period text NOT NULL DEFAULT 'custom',
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, plan_key)
);
CREATE INDEX IF NOT EXISTS app_plans_app_active_idx ON app_plans (app_id, active);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency char(3) NOT NULL CHECK (currency = upper(currency) AND currency ~ '^[A-Z]{3}$'),
  rate_to_htg numeric(14,6) NOT NULL CHECK (rate_to_htg > 0),
  effective_on date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (currency, effective_on)
);
CREATE INDEX IF NOT EXISTS exchange_rates_currency_date_idx ON exchange_rates (currency, effective_on DESC);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS source_amount numeric(12,2);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS source_currency char(3);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS exchange_rate numeric(14,6);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES app_plans(id) ON DELETE SET NULL;

INSERT INTO exchange_rates (currency, rate_to_htg, source)
VALUES ('HTG', 1, 'system') ON CONFLICT (currency, effective_on) DO NOTHING;

INSERT INTO app_plans (app_id, plan_key, name, amount, currency, period, description)
SELECT id, 'monthly', 'Pro Mensuel', 250, 'HTG', 'monthly', 'Facturé chaque mois.' FROM apps
ON CONFLICT (app_id, plan_key) DO NOTHING;
INSERT INTO app_plans (app_id, plan_key, name, amount, currency, period, description)
SELECT id, 'yearly', 'Pro Annuel', 2500, 'HTG', 'yearly', 'Facturé chaque année.' FROM apps
ON CONFLICT (app_id, plan_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES apps(id) ON DELETE CASCADE,
  raw_content text NOT NULL,
  sender_phone text,
  sender_name text,
  amount_detected numeric,
  reference text,
  reason text,
  status text NOT NULL DEFAULT 'unmatched',
  matched_subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS relay_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  raw_content text NOT NULL,
  sender text,
  status text NOT NULL DEFAULT 'success',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name text NOT NULL DEFAULT 'Zaka',
  saas_monthly_price numeric NOT NULL DEFAULT 1500,
  saas_yearly_price numeric NOT NULL DEFAULT 15000,
  trial_days integer NOT NULL DEFAULT 14,
  support_email text NOT NULL DEFAULT 'support@zaka.ht',
  relay_apk_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid NOT NULL,
  developer_email text,
  amount numeric NOT NULL,
  period text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  duration_type text NOT NULL CHECK (duration_type IN ('lifetime', 'monthly', 'yearly', 'trial_days')),
  trial_days integer CHECK (trial_days IS NULL OR trial_days BETWEEN 1 AND 3650),
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS developer_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('monthly', 'yearly', 'lifetime', 'trial_days')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'expired', 'cancelled')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'HTG',
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  promo_code_id uuid REFERENCES promo_codes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS developer_subscriptions_access_idx
  ON developer_subscriptions (developer_id, status, expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

INSERT INTO platform_settings (platform_name)
SELECT 'Zaka' WHERE NOT EXISTS (SELECT 1 FROM platform_settings);
