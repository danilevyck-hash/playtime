-- ============================================================
-- PlayTime v2: New features migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add deposits JSONB column for multiple deposits with dates
-- Format: [{"amount": 100, "date": "2026-04-05"}, ...]
ALTER TABLE pt_orders ADD COLUMN IF NOT EXISTS deposits JSONB DEFAULT '[]';

-- 2. Add discount column for admin-applied discounts
ALTER TABLE pt_orders ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;

-- 2b. Add discount_type column ('fixed' or 'percent')
ALTER TABLE pt_orders ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'fixed';

-- 3. Migrate existing deposit_amount data to deposits array
UPDATE pt_orders
SET deposits = json_build_array(
  json_build_object('amount', deposit_amount, 'date', created_at::date::text)
)
WHERE deposit_amount IS NOT NULL
  AND deposit_amount > 0
  AND (deposits IS NULL OR deposits = '[]'::jsonb);
