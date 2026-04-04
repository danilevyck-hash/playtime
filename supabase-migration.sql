-- ============================================================
-- PlayTime: Migrate product customizations to Supabase
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Product overrides (name, disabled, image for built-in products)
CREATE TABLE IF NOT EXISTS pt_product_overrides (
  id TEXT PRIMARY KEY,                          -- product_id
  name_override TEXT,                           -- custom name (null = use default)
  price_override NUMERIC,                       -- custom price (null = use default)
  description_override TEXT,                    -- custom description (null = use default)
  category_override TEXT,                       -- custom category (null = use default)
  disabled BOOLEAN NOT NULL DEFAULT FALSE,      -- hide from catalog
  image_url TEXT,                               -- custom image URL
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns if table already exists (idempotent)
DO $$ BEGIN
  ALTER TABLE pt_product_overrides ADD COLUMN IF NOT EXISTS price_override NUMERIC;
  ALTER TABLE pt_product_overrides ADD COLUMN IF NOT EXISTS description_override TEXT;
  ALTER TABLE pt_product_overrides ADD COLUMN IF NOT EXISTS category_override TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Custom products added by admin
CREATE TABLE IF NOT EXISTS pt_custom_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Generic key-value settings (reels, etc.)
CREATE TABLE IF NOT EXISTS pt_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RLS: Anon can READ all tables. Only authenticated can WRITE.
-- ============================================================

-- Drop old permissive anon policies (idempotent)
DO $$ BEGIN
  DROP POLICY IF EXISTS "anon_insert_pt_product_overrides" ON pt_product_overrides;
  DROP POLICY IF EXISTS "anon_update_pt_product_overrides" ON pt_product_overrides;
  DROP POLICY IF EXISTS "anon_delete_pt_product_overrides" ON pt_product_overrides;
  DROP POLICY IF EXISTS "anon_insert_pt_custom_products" ON pt_custom_products;
  DROP POLICY IF EXISTS "anon_update_pt_custom_products" ON pt_custom_products;
  DROP POLICY IF EXISTS "anon_delete_pt_custom_products" ON pt_custom_products;
  DROP POLICY IF EXISTS "anon_insert_pt_settings" ON pt_settings;
  DROP POLICY IF EXISTS "anon_update_pt_settings" ON pt_settings;
  DROP POLICY IF EXISTS "anon_delete_pt_settings" ON pt_settings;
END $$;

-- pt_product_overrides
ALTER TABLE pt_product_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "anon_select_pt_product_overrides" ON pt_product_overrides
  FOR SELECT TO anon USING (TRUE);

CREATE POLICY IF NOT EXISTS "auth_insert_pt_product_overrides" ON pt_product_overrides
  FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY IF NOT EXISTS "auth_update_pt_product_overrides" ON pt_product_overrides
  FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY IF NOT EXISTS "auth_delete_pt_product_overrides" ON pt_product_overrides
  FOR DELETE TO authenticated USING (TRUE);

-- pt_custom_products
ALTER TABLE pt_custom_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "anon_select_pt_custom_products" ON pt_custom_products
  FOR SELECT TO anon USING (TRUE);

CREATE POLICY IF NOT EXISTS "auth_insert_pt_custom_products" ON pt_custom_products
  FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY IF NOT EXISTS "auth_update_pt_custom_products" ON pt_custom_products
  FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY IF NOT EXISTS "auth_delete_pt_custom_products" ON pt_custom_products
  FOR DELETE TO authenticated USING (TRUE);

-- pt_settings
ALTER TABLE pt_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "anon_select_pt_settings" ON pt_settings
  FOR SELECT TO anon USING (TRUE);

CREATE POLICY IF NOT EXISTS "auth_insert_pt_settings" ON pt_settings
  FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY IF NOT EXISTS "auth_update_pt_settings" ON pt_settings
  FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY IF NOT EXISTS "auth_delete_pt_settings" ON pt_settings
  FOR DELETE TO authenticated USING (TRUE);

-- ============================================================
-- Service-role bypass: The app's API routes use the service role
-- key (SUPABASE_SERVICE_ROLE_KEY) for admin writes, which
-- bypasses RLS automatically. No extra policy needed.
-- ============================================================
