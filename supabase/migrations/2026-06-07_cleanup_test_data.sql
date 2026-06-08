-- ============================================================================
-- Migration: Physical cleanup of production test data
-- File:      2026-06-07_cleanup_test_data.sql
-- Why:       A manual end-to-end test left 3 logical artifacts in PROD. Remove
--            them PHYSICALLY (not the app's soft-delete via deleted_at) so the
--            DB is clean before a new user starts using Contabilidad.
--
-- Scope — EXACTLY these rows, nothing else:
--   * pt_orders        order_number = 661, customer_name = 'Prueba Contabilidad'
--   * pt_order_items   the line items belonging to that order (FK order_id)
--   * pt_vouchers      CI-0002  → (kind = 'ingreso', voucher_number = 2)  "Pago pedido #661"
--   * pt_vouchers      CE-0003  → (kind = 'egreso',  voucher_number = 3)  "Gasto de prueba contabilidad"
--
-- The CI-/CE- ↔ row mapping is verbatim from the UI formatter
-- (src/app/admin/contabilidad/page.tsx → voucherCode()):
--     `${kind === 'ingreso' ? 'CI' : 'CE'}-${String(voucher_number).padStart(4,'0')}`
-- So CI-0002 = ingreso #2 and CE-0003 = egreso #3.
--
-- Every statement is pinned to an exact key (order_number / kind+voucher_number)
-- with a content guard. No LIKE, no status-wide or "test"-pattern deletes.
--
-- HOW TO RUN: paste the GATE first, eyeball the rows, then run the MIGRATION,
-- then run the VERIFICATION. Apply in the Supabase SQL editor (service role).
-- ============================================================================


-- ============================================================================
-- GATE  —  run BEFORE. Confirm these are EXACTLY the rows you expect to lose.
-- ============================================================================
--
-- A) The test order + how many line items it has (note id and item_count):
--
--      SELECT o.id, o.order_number, o.customer_name, o.status, o.confirmed,
--             o.total, o.deleted_at, count(i.id) AS item_count
--      FROM pt_orders o
--      LEFT JOIN pt_order_items i ON i.order_id = o.id
--      WHERE o.order_number = 661
--        AND o.customer_name = 'Prueba Contabilidad'
--      GROUP BY o.id;
--
-- A2) The actual line items that will be deleted:
--
--      SELECT i.id, i.order_id, i.product_name, i.quantity, i.line_total
--      FROM pt_order_items i
--      JOIN pt_orders o ON o.id = i.order_id
--      WHERE o.order_number = 661
--        AND o.customer_name = 'Prueba Contabilidad'
--      ORDER BY i.id;
--
-- B) The two test vouchers, located by their id (kind + voucher_number):
--
--      SELECT id, voucher_number, kind, status, order_id, amount, description, created_at
--      FROM pt_vouchers
--      WHERE (kind = 'ingreso' AND voucher_number = 2)
--         OR (kind = 'egreso'  AND voucher_number = 3)
--      ORDER BY kind, voucher_number;
--
-- B2) The SAME two vouchers located by description (cross-check both lists match;
--     if a real description differs from the literals below, fix it before deleting):
--
--      SELECT id, voucher_number, kind, status, order_id, amount, description
--      FROM pt_vouchers
--      WHERE description IN ('Pago pedido #661', 'Gasto de prueba contabilidad')
--      ORDER BY kind, voucher_number;
--
-- B3) SAFETY — every voucher still pointing at order #661. The order delete will
--     FAIL if any voucher (other than CI-0002) references it. There should be
--     exactly ONE row here (CI-0002). If more appear, stop and review:
--
--      SELECT v.id, v.voucher_number, v.kind, v.amount, v.description
--      FROM pt_vouchers v
--      JOIN pt_orders o ON o.id = v.order_id
--      WHERE o.order_number = 661 AND o.customer_name = 'Prueba Contabilidad';
--
-- C) Baseline counts — write these three numbers down for the VERIFICATION step:
--
--      SELECT 'pt_orders'      AS tbl, count(*) AS n FROM pt_orders
--      UNION ALL SELECT 'pt_order_items', count(*) FROM pt_order_items
--      UNION ALL SELECT 'pt_vouchers',    count(*) FROM pt_vouchers;
--
-- EXPECTED to delete: 1 order  +  <item_count from A>  items  +  2 vouchers.
-- ============================================================================


-- ============================================================================
-- MIGRATION  —  atomic. RETURNING echoes exactly what each statement removed.
-- If anything looks wrong in the output, run ROLLBACK; instead of COMMIT;
-- ============================================================================
BEGIN;

-- 1) Vouchers FIRST: a voucher may reference the order via order_id, so it must
--    go before the order. Pinned to the exact id (kind + voucher_number) with a
--    description guard so this can only ever touch the two known test vouchers.
DELETE FROM pt_vouchers
WHERE (kind = 'ingreso' AND voucher_number = 2 AND description = 'Pago pedido #661')
   OR (kind = 'egreso'  AND voucher_number = 3 AND description = 'Gasto de prueba contabilidad')
RETURNING id, voucher_number, kind, amount, description;

-- 2) Line items of the test order (FK order_id -> pt_orders.id) BEFORE the order.
--    Bounded by the order's unique key via subquery (the order still exists here).
DELETE FROM pt_order_items
WHERE order_id = (
        SELECT id FROM pt_orders
        WHERE order_number = 661
          AND customer_name = 'Prueba Contabilidad'
      )
RETURNING id, order_id, product_name, quantity, line_total;

-- 3) The test order itself. customer_name guard protects any real order that
--    might ever carry this number.
DELETE FROM pt_orders
WHERE order_number = 661
  AND customer_name = 'Prueba Contabilidad'
RETURNING id, order_number, customer_name, total;

COMMIT;
-- ============================================================================


-- ============================================================================
-- VERIFICATION  —  run AFTER. All three must report gone, counts must match.
-- ============================================================================
--
-- 1) The three logical rows must no longer exist (each count must be 0):
--
--      SELECT 'order_661'      AS what, count(*) AS n
--      FROM pt_orders WHERE order_number = 661 AND customer_name = 'Prueba Contabilidad'
--      UNION ALL
--      SELECT 'items_of_661', count(*)
--      FROM pt_order_items i JOIN pt_orders o ON o.id = i.order_id
--      WHERE o.order_number = 661
--      UNION ALL
--      SELECT 'voucher_CI_0002', count(*)
--      FROM pt_vouchers WHERE kind = 'ingreso' AND voucher_number = 2
--      UNION ALL
--      SELECT 'voucher_CE_0003', count(*)
--      FROM pt_vouchers WHERE kind = 'egreso'  AND voucher_number = 3;
--
--      -- Expected: order_661 = 0, items_of_661 = 0, voucher_CI_0002 = 0, voucher_CE_0003 = 0
--
-- 2) Totals must equal the GATE baseline MINUS exactly the deleted rows:
--
--      SELECT 'pt_orders'      AS tbl, count(*) AS n FROM pt_orders
--      UNION ALL SELECT 'pt_order_items', count(*) FROM pt_order_items
--      UNION ALL SELECT 'pt_vouchers',    count(*) FROM pt_vouchers;
--
--      -- Expected vs GATE baseline:
--      --   pt_orders       = baseline - 1
--      --   pt_order_items  = baseline - <item_count from GATE A>
--      --   pt_vouchers     = baseline - 2
--
-- ============================================================================
