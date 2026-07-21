-- ============================================================================
-- Migration: pin search_path on the order RPCs (defense-in-depth hygiene)
-- File:      2026-07-21_rpc_search_path.sql
-- ============================================================================
--
-- PROBLEM
-- -------
-- The 7 order functions run without an explicit search_path. They're already
-- REVOKEd from public and only executable by service_role, so this is not an
-- active vulnerability — but pinning search_path is the recommended hardening
-- for SECURITY-relevant functions: it stops any resolution surprise if a
-- same-named object is created in a schema earlier on the caller's search_path.
--
-- We do NOT redefine the functions (no logic change): ALTER FUNCTION ... SET
-- search_path only attaches the setting. `pg_catalog, public` keeps built-ins
-- resolving first, then the app schema.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ SAFE TO APPLY ANYTIME. Pure metadata change; the function bodies and their │
-- │ float8/js_round2 arithmetic are untouched, so order totals do not change.  │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ============================================================================
-- GATE  —  run BEFORE; confirm the 7 functions exist and note current config
-- ============================================================================
--
--   SELECT p.proname, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('js_round2','compute_totals_raw','compute_order_totals',
--                       'recalc_order_totals','create_order','add_deposit','remove_deposit')
--   ORDER BY p.proname;
--   -- Expect 7 rows; proconfig is NULL (no search_path pinned yet).
--
-- ============================================================================
-- MIGRATION
-- ============================================================================

ALTER FUNCTION js_round2(double precision) SET search_path = pg_catalog, public;
ALTER FUNCTION compute_totals_raw(double precision, double precision, text, double precision, text) SET search_path = pg_catalog, public;
ALTER FUNCTION compute_order_totals(bigint) SET search_path = pg_catalog, public;
ALTER FUNCTION recalc_order_totals(bigint) SET search_path = pg_catalog, public;
ALTER FUNCTION create_order(jsonb, jsonb) SET search_path = pg_catalog, public;
ALTER FUNCTION add_deposit(bigint, numeric, text) SET search_path = pg_catalog, public;
ALTER FUNCTION remove_deposit(bigint, uuid) SET search_path = pg_catalog, public;

-- ============================================================================
-- VERIFICATION  —  run AFTER
-- ============================================================================
--
--   SELECT p.proname, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('js_round2','compute_totals_raw','compute_order_totals',
--                       'recalc_order_totals','create_order','add_deposit','remove_deposit')
--   ORDER BY p.proname;
--   -- Each proconfig must now contain: {search_path=pg_catalog, public}
--
-- POST-CHECK (functional): place a test order and add/remove a deposit from
-- /admin — totals and deposits must behave exactly as before.
--
-- ROLLBACK: ALTER FUNCTION <sig> RESET search_path;  (for each of the 7)
-- ============================================================================
