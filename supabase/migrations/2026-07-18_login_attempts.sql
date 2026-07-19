-- ============================================================================
-- Migration: Serverless-safe login rate limiting (login_attempts + RPCs)
-- File:      2026-07-18_login_attempts.sql
-- ============================================================================
--
-- PROBLEM
-- -------
-- src/lib/admin-auth.ts rate-limited PIN login with an in-memory Map. On
-- serverless (Vercel) the Map resets on every cold start and is not shared
-- across concurrent instances, so it does NOT stop a distributed brute-force of
-- the 4-digit PIN (10,000 combinations). This adds a Postgres-backed limiter,
-- atomic per IP, that survives cold starts.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ TOLERANT CODE: admin-auth.ts calls register_login_attempt / of            │
-- │ clear_login_attempts via the service-role client and FALLS BACK to the    │
-- │ in-memory limiter if the table/RPCs are missing. Applying this migration   │
-- │ only upgrades the limiter — login keeps working before AND after.         │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ============================================================================
-- GATE  —  run BEFORE the migration
-- ============================================================================
--
--   SELECT to_regclass('public.login_attempts');            -- expect NULL (not created yet)
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('register_login_attempt','clear_login_attempts');  -- expect 0 rows
--
-- ============================================================================
-- MIGRATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS login_attempts (
  ip        text PRIMARY KEY,
  count     int NOT NULL DEFAULT 0,
  reset_at  timestamptz NOT NULL
);

-- Deny-all RLS: no policies → anon/authenticated cannot read or write. The RPCs
-- below are SECURITY DEFINER and reachable only by service_role.
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Atomic: count this attempt within a 15-minute window (resetting an expired
-- window) and return TRUE if the IP is now over the 5-attempt limit.
CREATE OR REPLACE FUNCTION register_login_attempt(p_ip text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_now    timestamptz := now();
  v_window interval    := interval '15 minutes';
  v_max    int         := 5;
  v_count  int;
BEGIN
  INSERT INTO login_attempts (ip, count, reset_at)
  VALUES (p_ip, 1, v_now + v_window)
  ON CONFLICT (ip) DO UPDATE
    SET count    = CASE WHEN login_attempts.reset_at < v_now THEN 1 ELSE login_attempts.count + 1 END,
        reset_at = CASE WHEN login_attempts.reset_at < v_now THEN v_now + v_window ELSE login_attempts.reset_at END
  RETURNING count INTO v_count;
  RETURN v_count > v_max;
END;
$fn$;

CREATE OR REPLACE FUNCTION clear_login_attempts(p_ip text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  DELETE FROM login_attempts WHERE ip = p_ip;
$fn$;

REVOKE ALL ON FUNCTION register_login_attempt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION clear_login_attempts(text)   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION register_login_attempt(text) TO service_role;
GRANT EXECUTE ON FUNCTION clear_login_attempts(text)   TO service_role;

-- ============================================================================
-- VERIFICATION  —  run AFTER the migration
-- ============================================================================
--
--   SELECT register_login_attempt('test-ip');   -- false (1/5)
--   SELECT register_login_attempt('test-ip');   -- false (2/5)
--   -- ... call 4 more times; the 6th call returns TRUE (locked)
--   SELECT clear_login_attempts('test-ip');
--   SELECT * FROM login_attempts WHERE ip = 'test-ip';   -- 0 rows
--
-- anon must NOT be able to read the table:
--   (with the anon key)  SELECT * FROM login_attempts;   -- blocked / 0 rows
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS register_login_attempt(text);
--   DROP FUNCTION IF EXISTS clear_login_attempts(text);
--   DROP TABLE IF EXISTS login_attempts;
--   (code falls back to the in-memory limiter automatically)
-- ============================================================================
