-- Migration 002: SaaS Subscriptions, Promo Codes & Admin Features
-- Date: 2023-10-27

-- 1. Table des abonnements Développeurs (SaaS Zaka Pro)
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'inactive', -- 'active', 'expired', 'cancelled', 'trial'
    plan_type TEXT NOT NULL DEFAULT 'free', -- 'free', 'pro_monthly', 'pro_yearly'
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date TIMESTAMPTZ, -- NULL si lifetime ou inactive
    trial_ends_at TIMESTAMPTZ, -- Pour les périodes d'essai
    payment_provider TEXT, -- 'moncash', 'natcash', 'stripe'
    last_payment_amount NUMERIC(10, 2),
    currency TEXT DEFAULT 'HTG',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);

-- 2. Table des Codes Promotionnels
CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL, -- 'percentage', 'fixed_amount', 'free_days', 'upgrade_plan'
    discount_value NUMERIC(10, 2) NOT NULL DEFAULT 0, -- Pourcentage (0-100) ou Montant fixe ou Jours
    target_plan TEXT, -- Si upgrade_plan (ex: 'pro_yearly')
    duration_type TEXT NOT NULL, -- 'lifetime', 'monthly', 'yearly', 'trial_days'
    duration_value INTEGER DEFAULT 0, -- Nombre de jours si trial_days, sinon 1
    max_uses INTEGER DEFAULT NULL, -- NULL = illimité
    current_uses INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ, -- Date d'expiration du code lui-même
    created_by UUID REFERENCES users(id), -- Admin qui a créé le code
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_promo_codes_code ON promo_codes(code);
CREATE INDEX idx_promo_codes_active ON promo_codes(is_active);

-- 3. Table d'historique d'utilisation des codes (pour éviter les abus)
CREATE TABLE IF NOT EXISTS promo_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(promo_code_id, user_id) -- Un code par utilisateur
);

-- 4. Mise à jour de la table apps pour s'assurer du lien owner_id explicite
-- (Supposé existant, mais on ajoute un index pour la perf du middleware)
CREATE INDEX IF NOT EXISTS idx_apps_owner_id ON apps(owner_id);
CREATE INDEX IF NOT EXISTS idx_apps_api_key ON apps(api_key);

-- 5. Vue matérialisée (optionnelle) pour l'admin dashboard (stats rapides)
-- Note: Dans Neon/Postgres standard, on peut utiliser une vue simple
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT 
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') as active_subscriptions,
    (SELECT COUNT(*) FROM apps) as total_apps,
    (SELECT SUM(last_payment_amount) FROM subscriptions WHERE currency = 'HTG') as total_revenue_htg,
    (SELECT COUNT(*) FROM promo_codes WHERE is_active = TRUE) as active_promos;

COMMENT ON TABLE subscriptions IS 'Gère les abonnements SaaS des développeurs utilisant Zaka Pro';
COMMENT ON TABLE promo_codes IS 'Codes promotionnels pour réduire ou offrir des abonnements';
