-- Custom plans: plan_key is unique PER APPLICATION, not globally.
-- Safe/idempotent migration for Neon PostgreSQL.

BEGIN;

ALTER TABLE app_plans
  DROP CONSTRAINT IF EXISTS app_plans_plan_key_key;

DO $$
DECLARE
  idx record;
BEGIN
  FOR idx IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'app_plans'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ~* '\\(\\s*plan_key\\s*\\)'
      AND indexdef !~* '\\(\\s*app_id\\s*,\\s*plan_key\\s*\\)'
      AND indexdef !~* '\\(\\s*plan_key\\s*,\\s*app_id\\s*\\)'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx.indexname);
  END LOOP;
END $$;

-- Legacy deployments may contain duplicate rows for the same app/key.
-- Keep the oldest row before creating the scoped unique index.
DELETE FROM app_plans a
USING app_plans b
WHERE a.ctid <> b.ctid
  AND a.app_id = b.app_id
  AND LOWER(a.plan_key) = LOWER(b.plan_key)
  AND (
    a.created_at > b.created_at
    OR (a.created_at = b.created_at AND a.id::text > b.id::text)
  );

CREATE UNIQUE INDEX IF NOT EXISTS app_plans_app_id_plan_key_uq
  ON app_plans (app_id, plan_key);

COMMIT;
