-- ============================================================================
-- Migration (GATE FUERTE): RPCs atómicos crear/recalc pedido + idempotency_key
-- File:      2026-06-06_orders_rpcs.sql
-- ============================================================================
--
-- CONTEXTO (ítem 4 Sprint 3):
--   - POST /api/orders inserta order+items en 2 statements: si items falla, hoy se
--     hace rollback manual (borrar el order). Lo movemos a un RPC transaccional.
--   - Los recalcs del PATCH (discount/transport/editItems/addItem/removeItem) son
--     multi-statement no atómicos; refetch null deja totales stale. Se centralizan.
--   - Falta idempotencia server-side ante doble-tap en "Confirmar".
--
-- Este gate agrega:
--   1) pt_orders.idempotency_key (uuid) + índice UNIQUE parcial.
--   2) compute_order_totals(order_id)  → READ-ONLY, devuelve {subtotal,surcharge,total}.
--      (lo usa el script de verificación recalc-JS-vs-SQL SIN mutar nada)
--   3) recalc_order_totals(order_id)   → compute + UPDATE atómico.
--   4) create_order(p_order, p_items)  → insert order+items en UNA transacción,
--      idempotente por idempotency_key.
--
-- ⚠️ APLICAR ANTES del código del ítem 4. El código JS sigue haciendo TODA la
--    validación + override de precios + cálculo (no se reimplementa en SQL); estos
--    RPCs solo persisten/recalculan atómico.
--
-- ⚠️ PARIDAD CRÍTICA: compute_order_totals ESPEJA el helper recalcTotals de
--    src/app/api/orders/route.ts. La tasa de recargo de tarjeta (0.05) está
--    HARDCODED aquí → mantener en sync con CREDIT_CARD_SURCHARGE en
--    src/lib/constants.ts si cambia. round2(n) ≡ round(n::numeric, 2) (los montos
--    son ≥ 0, así que round-half-away-from-zero coincide con Math.round del JS).
--    VERIFICAR con scripts/verify-recalc-rpc.mjs que el RPC da el MISMO número que
--    el JS sobre TODOS los pedidos existentes ANTES de cortar el código a usarlo.
--
-- ============================================================================
-- GATE (antes) — anotar a mano
-- ============================================================================
-- 1) idempotency_key NO debe existir; los 3 functions tampoco:
--      SELECT column_name FROM information_schema.columns
--      WHERE table_name='pt_orders' AND column_name='idempotency_key';   -- 0 filas
--      SELECT proname FROM pg_proc
--      WHERE proname IN ('compute_order_totals','recalc_order_totals','create_order'); -- 0 filas
-- 2) Snapshot de totales (para comparar post-script):
--      SELECT count(*) AS total FROM pt_orders;
--
-- ============================================================================
-- MIGRACIÓN
-- ============================================================================

-- 1) idempotency_key + unique parcial (nulls de pedidos viejos no chocan).
ALTER TABLE pt_orders ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pt_orders_idempotency_key
  ON pt_orders (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2) compute_order_totals — READ-ONLY. ESPEJA recalcTotals() de route.ts.
CREATE OR REPLACE FUNCTION compute_order_totals(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_items_total numeric;
  v_discount numeric;
  v_discount_type text;
  v_transport numeric;
  v_payment text;
  v_disc numeric;
  v_subtotal_after numeric;
  v_base numeric;
  v_surcharge numeric;
  v_total numeric;
BEGIN
  -- itemsTotal = round2(Σ line_total)
  SELECT COALESCE(round(SUM(line_total)::numeric, 2), 0)
    INTO v_items_total
    FROM pt_order_items WHERE order_id = p_order_id;

  SELECT GREATEST(0, COALESCE(discount, 0)),
         COALESCE(discount_type, 'fixed'),
         GREATEST(0, COALESCE(transport_cost_confirmed, 0)),
         payment_method
    INTO v_discount, v_discount_type, v_transport, v_payment
    FROM pt_orders WHERE id = p_order_id;

  -- disc = percent ? round2(itemsTotal*disc/100) : disc
  IF v_discount_type = 'percent' THEN
    v_disc := round((v_items_total * v_discount / 100)::numeric, 2);
  ELSE
    v_disc := v_discount;
  END IF;

  v_subtotal_after := GREATEST(0, v_items_total - v_disc);
  v_base := v_subtotal_after + v_transport;

  IF v_payment = 'credit_card' THEN
    v_surcharge := round((v_base * 0.05)::numeric, 2);  -- CREDIT_CARD_SURCHARGE
  ELSE
    v_surcharge := 0;
  END IF;
  v_total := round((v_base + v_surcharge)::numeric, 2);

  RETURN jsonb_build_object('subtotal', v_items_total, 'surcharge', v_surcharge, 'total', v_total);
END;
$$;

-- 3) recalc_order_totals — compute + UPDATE atómico.
CREATE OR REPLACE FUNCTION recalc_order_totals(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE v jsonb;
BEGIN
  v := compute_order_totals(p_order_id);
  UPDATE pt_orders
     SET subtotal  = (v->>'subtotal')::numeric,
         surcharge = (v->>'surcharge')::numeric,
         total     = (v->>'total')::numeric
   WHERE id = p_order_id;
  RETURN v;
END;
$$;

-- 4) create_order — insert order+items en UNA transacción; idempotente por key.
--    El JS pasa valores YA computados (subtotal/surcharge/total/transport).
CREATE OR REPLACE FUNCTION create_order(p_order jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id  bigint;
  v_num bigint;
  v_key uuid := NULLIF(p_order->>'idempotency_key', '')::uuid;
BEGIN
  -- Idempotencia (caso común): si ya existe un pedido con esta key, devolverlo.
  IF v_key IS NOT NULL THEN
    SELECT id, order_number INTO v_id, v_num FROM pt_orders WHERE idempotency_key = v_key;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_id, 'order_number', v_num, 'deduped', true);
    END IF;
  END IF;

  INSERT INTO pt_orders (
    customer_name, customer_phone, customer_email,
    event_date, event_time, event_area, event_address,
    birthday_child_name, birthday_child_age, payment_method,
    subtotal, transport_cost_confirmed, surcharge, total, notes, idempotency_key
  ) VALUES (
    p_order->>'customer_name',
    p_order->>'customer_phone',
    NULLIF(p_order->>'customer_email', ''),
    (p_order->>'event_date')::date,
    p_order->>'event_time',
    NULLIF(p_order->>'event_area', ''),
    p_order->>'event_address',
    NULLIF(p_order->>'birthday_child_name', ''),
    NULLIF(p_order->>'birthday_child_age', '')::int,
    p_order->>'payment_method',
    (p_order->>'subtotal')::numeric,
    CASE WHEN p_order->>'transport_cost_confirmed' IS NULL THEN NULL
         ELSE (p_order->>'transport_cost_confirmed')::numeric END,
    (p_order->>'surcharge')::numeric,
    (p_order->>'total')::numeric,
    NULLIF(p_order->>'notes', ''),
    v_key
  )
  RETURNING id, order_number INTO v_id, v_num;

  INSERT INTO pt_order_items (order_id, product_id, product_name, category, quantity, unit_price, line_total)
  SELECT v_id, e->>'product_id', e->>'product_name', e->>'category',
         (e->>'quantity')::int, (e->>'unit_price')::numeric, (e->>'line_total')::numeric
  FROM jsonb_array_elements(p_items) AS e;

  RETURN jsonb_build_object('id', v_id, 'order_number', v_num, 'deduped', false);

EXCEPTION WHEN unique_violation THEN
  -- Carrera: otra request con la misma key insertó primero → devolver el existente.
  SELECT id, order_number INTO v_id, v_num FROM pt_orders WHERE idempotency_key = v_key;
  RETURN jsonb_build_object('id', v_id, 'order_number', v_num, 'deduped', true);
END;
$$;

-- 5) Seguridad: SOLO service_role puede ejecutar (el server llama con supabaseAdmin).
--    Sin esto, PostgREST expone los RPCs a anon/authenticated (anon podría recalcular
--    o crear pedidos). REVOKE de public/anon/authenticated, GRANT a service_role.
REVOKE ALL ON FUNCTION compute_order_totals(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION recalc_order_totals(bigint)  FROM PUBLIC;
REVOKE ALL ON FUNCTION create_order(jsonb, jsonb)   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION compute_order_totals(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION recalc_order_totals(bigint)  TO service_role;
GRANT EXECUTE ON FUNCTION create_order(jsonb, jsonb)   TO service_role;

-- ============================================================================
-- VERIFICACIÓN (después)
-- ============================================================================
-- 1) Columna + índice + functions existen:
--      SELECT column_name FROM information_schema.columns
--      WHERE table_name='pt_orders' AND column_name='idempotency_key';   -- 1 fila
--      SELECT indexname FROM pg_indexes
--      WHERE tablename='pt_orders' AND indexname='idx_pt_orders_idempotency_key';
--      SELECT proname FROM pg_proc
--      WHERE proname IN ('compute_order_totals','recalc_order_totals','create_order'); -- 3
--
-- 2) Permisos: anon/authenticated NO pueden ejecutar:
--      SELECT proname, proacl FROM pg_proc
--      WHERE proname IN ('compute_order_totals','recalc_order_totals','create_order');
--      -- proacl debe listar solo service_role (=X), no anon/authenticated.
--
-- 3) Sanity de un pedido conocido (read-only):
--      SELECT compute_order_totals(<algún order id>);
--      -- comparar contra subtotal/surcharge/total guardados de ese pedido.
--
-- ============================================================================
-- POST-CHECK funcional (OBLIGATORIO antes de mergear el código del ítem 4)
-- ============================================================================
-- Correr el script de paridad JS-vs-SQL sobre TODOS los pedidos existentes:
--
--   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-recalc-rpc.mjs
--
-- Debe reportar 0 divergencias (mismo subtotal/surcharge/total que el JS) antes de
-- cortar el código a usar el RPC. Si hay divergencias → NO mergear; revisar el SQL.
--
-- ROLLBACK (si NO se deployó el código que los usa):
--   DROP FUNCTION IF EXISTS create_order(jsonb, jsonb);
--   DROP FUNCTION IF EXISTS recalc_order_totals(bigint);
--   DROP FUNCTION IF EXISTS compute_order_totals(bigint);
--   DROP INDEX IF EXISTS idx_pt_orders_idempotency_key;
--   ALTER TABLE pt_orders DROP COLUMN IF EXISTS idempotency_key;
-- ============================================================================
