-- ============================================================
-- PlayTime: Migrate product customizations to Supabase
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Product overrides (name, disabled, image for built-in products)
CREATE TABLE IF NOT EXISTS pt_product_overrides (
  id TEXT PRIMARY KEY,                          -- product_id
  name_override TEXT,                           -- custom name (null = use default)
  disabled BOOLEAN NOT NULL DEFAULT FALSE,      -- hide from catalog
  image_url TEXT,                               -- custom image URL
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
-- RLS: Allow anonymous (anon) full access
-- ============================================================

-- pt_product_overrides
ALTER TABLE pt_product_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_pt_product_overrides" ON pt_product_overrides
  FOR SELECT TO anon USING (TRUE);

CREATE POLICY "anon_insert_pt_product_overrides" ON pt_product_overrides
  FOR INSERT TO anon WITH CHECK (TRUE);

CREATE POLICY "anon_update_pt_product_overrides" ON pt_product_overrides
  FOR UPDATE TO anon USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "anon_delete_pt_product_overrides" ON pt_product_overrides
  FOR DELETE TO anon USING (TRUE);

-- pt_custom_products
ALTER TABLE pt_custom_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_pt_custom_products" ON pt_custom_products
  FOR SELECT TO anon USING (TRUE);

CREATE POLICY "anon_insert_pt_custom_products" ON pt_custom_products
  FOR INSERT TO anon WITH CHECK (TRUE);

CREATE POLICY "anon_update_pt_custom_products" ON pt_custom_products
  FOR UPDATE TO anon USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "anon_delete_pt_custom_products" ON pt_custom_products
  FOR DELETE TO anon USING (TRUE);

-- pt_settings
ALTER TABLE pt_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_pt_settings" ON pt_settings
  FOR SELECT TO anon USING (TRUE);

CREATE POLICY "anon_insert_pt_settings" ON pt_settings
  FOR INSERT TO anon WITH CHECK (TRUE);

CREATE POLICY "anon_update_pt_settings" ON pt_settings
  FOR UPDATE TO anon USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "anon_delete_pt_settings" ON pt_settings
  FOR DELETE TO anon USING (TRUE);
