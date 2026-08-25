-- Migration 003: Production Fixes - Session-based Payment Architecture (Stripe-like)
-- Date: 2025-01-XX
-- Purpose: Complete architecture for secure payment sessions with Zaka Relay validation

BEGIN;

-- 1. Add missing columns to subscriptions table for proper session management
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS user_phone TEXT,
ADD COLUMN IF NOT EXISTS account_name TEXT,
ADD COLUMN IF NOT EXISTS provider TEXT, -- 'moncash' or 'natcash'
ADD COLUMN IF NOT EXISTS source_amount NUMERIC(10, 2), -- Amount in original currency
ADD COLUMN IF NOT EXISTS source_currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10, 4) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES app_plans(id),
ADD COLUMN IF NOT EXISTS reference TEXT, -- Transaction reference from SMS
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_app_id ON subscriptions(app_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_pending ON subscriptions(status) WHERE status = 'pending';

-- 2. Add relay tracking to apps table
ALTER TABLE apps 
ADD COLUMN IF NOT EXISTS relay_last_seen_at TIMESTAMPTZ;

-- 3. Create relay_logs table for debugging SMS relay operations
CREATE TABLE IF NOT EXISTS relay_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    raw_content TEXT NOT NULL,
    sender TEXT,
    status TEXT NOT NULL, -- 'success', 'failed', 'rejected'
    detail TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_logs_app_id ON relay_logs(app_id);
CREATE INDEX IF NOT EXISTS idx_relay_logs_created_at ON relay_logs(created_at DESC);

-- 4. Enhance sms_logs table with proper fields
CREATE TABLE IF NOT EXISTS sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    raw_content TEXT NOT NULL,
    sender_phone TEXT,
    status TEXT NOT NULL, -- 'matched', 'unmatched', 'rejected'
    reason TEXT,
    amount_detected NUMERIC(10, 2),
    sender_name TEXT,
    reference TEXT,
    matched_subscription_id UUID REFERENCES subscriptions(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_app_id ON sms_logs(app_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_matched_sub ON sms_logs(matched_subscription_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON sms_logs(created_at DESC);

-- 5. Insert default test API key for development (placeholder)
INSERT INTO apps (id, name, api_key, owner_id, moncash_number, natcash_number, is_active)
SELECT 
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Demo Merchant (Placeholder)',
    'sk_live_placeholder',
    NULL, -- No owner (test mode)
    '78000000',
    '98000000',
    true
WHERE NOT EXISTS (SELECT 1 FROM apps WHERE api_key = 'sk_live_placeholder');

-- 6. Insert default plans for placeholder app
INSERT INTO app_plans (app_id, plan_key, label, amount, currency, period, description, badge, is_active)
SELECT 
    '00000000-0000-0000-0000-000000000001'::uuid,
    'pro',
    'Plan Pro',
    15.00,
    'USD',
    'month',
    'Accès complet aux fonctionnalités Pro',
    'Populaire',
    true
WHERE NOT EXISTS (
    SELECT 1 FROM app_plans WHERE app_id = '00000000-0000-0000-0000-000000000001' AND plan_key = 'pro'
);

-- 7. Ensure exchange rates exist with proper structure
INSERT INTO exchange_rates (base_currency, target_currency, rate, source, valid_from, is_current)
VALUES 
    ('USD', 'HTG', 130.00, 'manual', CURRENT_DATE, true),
    ('EUR', 'HTG', 140.00, 'manual', CURRENT_DATE, true)
ON CONFLICT (base_currency, target_currency, valid_from) 
DO UPDATE SET rate = EXCLUDED.rate, is_current = true, updated_at = NOW();

-- 8. Deactivate old non-current rates
UPDATE exchange_rates 
SET is_current = false 
WHERE valid_from < CURRENT_DATE AND is_current = true;

COMMIT;

COMMENT ON TABLE relay_logs IS 'Logs des requêtes reçues du Zaka Relay (mobile)';
COMMENT ON TABLE sms_logs IS 'Historique détaillé des SMS analysés et leur correspondance avec les abonnements';
