-- Custom plans: plan_key is unique PER APPLICATION, not globally.
-- Safe/idempotent migration for Neon PostgreSQL.

BEGIN;

-- Remove the legacy global UNIQUE(plan_key) constraint if it exists.
ALTER TABLE app_plans
  DROP CONSTRAINT IF EXISTS app_plans_plan_key_key;

-- Remove a legacy unique index on plan_key alone, if one exists.
DO $$
DECLARE
  idx record;
BEGIN
  FOR idx IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'app_plans'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%ON%app_plans%(%plan_key%)'
      AND indexdef NOT ILIKE '%(app_id, plan_key)%'
      AND indexdef NOT ILIKE '%(plan_key, app_id)%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx.indexname);
  END LOOP;
END $$;

-- The only business uniqueness rule is now scoped to app_id + plan_key.
CREATE UNIQUE INDEX IF NOT EXISTS app_plans_app_id_plan_key_uq
  ON app_plans (app_id, plan_key);

COMMIT;
