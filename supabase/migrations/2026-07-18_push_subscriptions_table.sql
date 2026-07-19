-- ============================================================================
-- Migration: Move push subscriptions out of world-readable pt_settings
-- File:      2026-07-18_push_subscriptions_table.sql
-- ============================================================================
--
-- PROBLEM
-- -------
-- Push subscriptions (endpoint + p256dh/auth keys of the admin/vendedora
-- devices) were stored under pt_settings key='push_subscriptions'. pt_settings
-- has `anon SELECT USING (true)` (needed for logo/site texts), so ANYONE with
-- the anon key could read the push endpoints/keys. This moves them to a
-- dedicated table with deny-all RLS (service-role only) and deletes the old
-- blob so anon can no longer read it.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ TOLERANT CODE: src/lib/push-subscriptions.ts reads/writes this table with │
-- │ the service-role client and FALLS BACK to the old pt_settings blob if the │
-- │ table is missing. Deploy the code first; push keeps working before AND    │
-- │ after. Orders never break — push is best-effort inside POST /api/orders.  │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ============================================================================
-- GATE  —  run BEFORE the migration; record the count
-- ============================================================================
--
--   SELECT to_regclass('public.pt_push_subscriptions');   -- expect NULL
--   SELECT jsonb_array_length(value) AS existing_subs
--   FROM pt_settings WHERE key = 'push_subscriptions';     -- note this number
--
-- ============================================================================
-- MIGRATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS pt_push_subscriptions (
  endpoint    text PRIMARY KEY,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Deny-all RLS: no policies → anon/authenticated blocked. Only the service-role
-- client (which bypasses RLS) reads/writes it, from server code.
ALTER TABLE pt_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Migrate existing subscriptions from the pt_settings blob.
INSERT INTO pt_push_subscriptions (endpoint, p256dh, auth)
SELECT s->>'endpoint', s->'keys'->>'p256dh', s->'keys'->>'auth'
FROM pt_settings, jsonb_array_elements(value) AS s
WHERE key = 'push_subscriptions'
  AND s ? 'endpoint'
  AND (s->'keys') ? 'p256dh'
  AND (s->'keys') ? 'auth'
ON CONFLICT (endpoint) DO NOTHING;

-- Remove the now-migrated blob so anon can no longer read push keys via pt_settings.
DELETE FROM pt_settings WHERE key = 'push_subscriptions';

-- ============================================================================
-- VERIFICATION  —  run AFTER the migration
-- ============================================================================
--
--   SELECT count(*) FROM pt_push_subscriptions;   -- should equal existing_subs from the GATE
--   SELECT * FROM pt_settings WHERE key = 'push_subscriptions';   -- 0 rows
--
-- anon must NOT be able to read the new table:
--   (with the anon key)  SELECT * FROM pt_push_subscriptions;   -- blocked / 0 rows
--
-- POST-CHECK: from /admin enable notifications on a device (re-registers the
-- subscription into the new table), then place a test order and confirm the
-- push arrives.
--
-- ROLLBACK:
--   -- (optional) copy back into pt_settings before dropping:
--   -- INSERT INTO pt_settings(key,value)
--   -- SELECT 'push_subscriptions',
--   --   coalesce(jsonb_agg(jsonb_build_object('endpoint',endpoint,
--   --     'keys',jsonb_build_object('p256dh',p256dh,'auth',auth))), '[]'::jsonb)
--   -- FROM pt_push_subscriptions
--   -- ON CONFLICT (key) DO UPDATE SET value = excluded.value;
--   DROP TABLE IF EXISTS pt_push_subscriptions;
-- ============================================================================
