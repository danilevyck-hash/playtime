-- ============================================================================
-- Migration: Drop the authenticated USING(true) WRITE policies (latent surface)
-- File:      2026-07-21_drop_authenticated_write_policies.sql
-- ============================================================================
--
-- PROBLEM
-- -------
-- pt_product_overrides, pt_custom_products, pt_settings, pt_products and
-- pt_product_variants each have INSERT/UPDATE/DELETE (or FOR ALL) policies granted
-- to the `authenticated` role with USING(true)/WITH CHECK(true) — i.e. any signed
-- Supabase JWT could write the whole catalog + settings. The app never uses the
-- `authenticated` role: all writes go through the API routes with the SERVICE_ROLE
-- client (which BYPASSES RLS). So these policies grant nothing the app needs and
-- are pure latent attack surface. This drops them; the anon SELECT policies (public
-- catalog reads) stay untouched.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ SAFE TO APPLY ANYTIME. The admin writes with the service-role key, which   │
-- │ bypasses RLS entirely, so dropping authenticated-role policies does not     │
-- │ affect saving products, variants, overrides, custom products or settings.   │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ============================================================================
-- GATE  —  run BEFORE; record the output
-- ============================================================================
--
-- 1) Current policies on the 5 tables (note the auth_* write ones you'll drop):
--
--      SELECT tablename, policyname, roles, cmd
--      FROM pg_policies
--      WHERE tablename IN ('pt_product_overrides','pt_custom_products','pt_settings',
--                          'pt_products','pt_product_variants')
--      ORDER BY tablename, policyname;
--
-- 2) Confirm the app is NOT relying on the authenticated role (it should only ever
--    use anon for reads + service_role for writes). Expected: no app code signs in
--    Supabase users. (Grep confirms: writes go via /api/* with supabaseAdmin.)
--
-- ============================================================================
-- MIGRATION  —  drop authenticated write policies; keep anon SELECT
-- ============================================================================

-- pt_product_overrides
DROP POLICY IF EXISTS "auth_insert_pt_product_overrides" ON pt_product_overrides;
DROP POLICY IF EXISTS "auth_update_pt_product_overrides" ON pt_product_overrides;
DROP POLICY IF EXISTS "auth_delete_pt_product_overrides" ON pt_product_overrides;

-- pt_custom_products
DROP POLICY IF EXISTS "auth_insert_pt_custom_products" ON pt_custom_products;
DROP POLICY IF EXISTS "auth_update_pt_custom_products" ON pt_custom_products;
DROP POLICY IF EXISTS "auth_delete_pt_custom_products" ON pt_custom_products;

-- pt_settings
DROP POLICY IF EXISTS "auth_insert_pt_settings" ON pt_settings;
DROP POLICY IF EXISTS "auth_update_pt_settings" ON pt_settings;
DROP POLICY IF EXISTS "auth_delete_pt_settings" ON pt_settings;

-- pt_products (FOR ALL policy)
DROP POLICY IF EXISTS "auth_all_pt_products" ON pt_products;

-- pt_product_variants (FOR ALL policy)
DROP POLICY IF EXISTS "auth_all_pt_product_variants" ON pt_product_variants;

-- NOTE: the anon_select_* policies are intentionally KEPT — the public catalog
--       reads these tables with the anon key. Only the write grants are removed.

-- ============================================================================
-- VERIFICATION  —  run AFTER
-- ============================================================================
--
-- 1) No authenticated-role policy remains on the 5 tables (expect 0 rows):
--
--      SELECT tablename, policyname, cmd
--      FROM pg_policies
--      WHERE tablename IN ('pt_product_overrides','pt_custom_products','pt_settings',
--                          'pt_products','pt_product_variants')
--        AND 'authenticated' = ANY(roles)
--      ORDER BY tablename, policyname;
--
-- 2) The anon SELECT policies still exist (public reads intact):
--
--      SELECT tablename, policyname FROM pg_policies
--      WHERE tablename IN ('pt_product_overrides','pt_custom_products','pt_settings',
--                          'pt_products','pt_product_variants')
--        AND cmd = 'SELECT' AND 'anon' = ANY(roles);
--
-- POST-CHECK (functional, after deploy): from /admin edit a product, a setting
-- (e.g. featured products) and a variant — all must still save (service role).
-- The public catalog must still load (anon SELECT).
--
-- ROLLBACK (only if something unexpectedly used the authenticated role):
--   -- re-create the dropped policies, e.g.
--   -- CREATE POLICY "auth_all_pt_products" ON pt_products
--   --   FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
--   -- (and the insert/update/delete ones for the other tables)
-- ============================================================================
