-- ============================================================================
-- Migration (GATE FUERTE): RPCs atómicos crear/recalc pedido + idempotency_key
-- File:      2026-06-06_orders_rpcs.sql   (rev 2 — corregido tras review adversarial)
-- ============================================================================
--
-- CONTEXTO (ítem 4 Sprint 3): mover la creación e items a un RPC transaccional
-- (hoy 2 statements con rollback manual) y centralizar los recalcs (multi-statement
-- no atómicos; refetch null deja totales stale) + idempotencia server-side.
--
-- Agrega: pt_orders.idempotency_key + unique parcial; compute_totals_raw (pura),
-- compute_order_totals (lee DB), recalc_order_totals (compute+update atómico),
-- create_order (insert order+items en 1 txn, idempotente).
--
-- ⚠️ APLICAR ANTES del código del ítem 4. El JS sigue haciendo validación + override
--    de precios + cálculo; estos RPCs solo persisten/recalculan atómico.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PARIDAD DE REDONDEO (corregido — el review encontró que round(numeric,2) NO
-- equivale a Math.round(n*100)/100): JS opera en IEEE-754 float64; en los medio-
-- centavos (.xx5) la representación float cae apenas por debajo y JS redondea ABAJO,
-- mientras round(numeric,2) es decimal exacto y redondea ARRIBA (ej: base=42.30 →
-- surcharge js 2.11 vs pg 2.12). Como los pedidos HISTÓRICOS se calcularon con JS,
-- la paridad con ellos manda → REPLICAMOS el float de JS en SQL:
--   `double precision` de Postgres ES IEEE-754 float64 (idéntico a Number de JS).
--   js_round2(x) := floor(x*100 + 0.5) / 100  en float8  ≡  Math.round(x*100)/100
--   (válido para x ≥ 0, que es todo nuestro dominio: montos, descuentos, surcharge).
-- TODA la aritmética del cálculo va en float8 con js_round2; así reproduce el JS
-- bit a bit. (NO se cambia recalcTotals de route.ts.)
-- ⚠️ La tasa 0.05 (CREDIT_CARD_SURCHARGE) está HARDCODED como 0.05::float8 →
--    mantener en sync con src/lib/constants.ts si cambia.
-- VERIFICAR con scripts/verify-recalc-rpc.mjs (pedidos reales + inputs sintéticos
--    .10/.30/.70/.90 + credit_card + descuentos %) que da 0 divergencias.
--
-- ============================================================================
-- GATE (antes) — anotar a mano
-- ============================================================================
-- 1) Nada de esto debe existir:
--      SELECT column_name FROM information_schema.columns
--      WHERE table_name='pt_orders' AND column_name='idempotency_key';   -- 0
--      SELECT proname FROM pg_proc WHERE proname IN
--      ('js_round2','compute_totals_raw','compute_order_totals','recalc_order_totals','create_order'); -- 0
-- 2) Snapshot:  SELECT count(*) FROM pt_orders;
--
-- ============================================================================
-- MIGRACIÓN
-- ============================================================================

-- 1) idempotency_key + unique parcial (nulls de pedidos viejos no chocan).
ALTER TABLE pt_orders ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pt_orders_idempotency_key
  ON pt_orders (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2) js_round2 — emula Math.round(x*100)/100 en float64. floor(x*100+0.5)/100.
--    (x ≥ 0 en todo nuestro dominio; coincide bit a bit con el JS.)
CREATE OR REPLACE FUNCTION js_round2(x double precision)
RETURNS double precision
LANGUAGE sql IMMUTABLE
AS $$ SELECT floor(x * 100.0::float8 + 0.5::float8) / 100.0::float8 $$;

-- 3) compute_totals_raw — PURA (sin DB). ESPEJA recalcTotals() en float8.
--    Recibe items_total YA computado (round2 de la suma) + descuento/transp/pago.
CREATE OR REPLACE FUNCTION compute_totals_raw(
  p_items_total double precision,
  p_discount double precision,
  p_discount_type text,
  p_transport double precision,
  p_payment text
)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_disc_raw double precision := GREATEST(0::float8, p_discount);
  v_disc double precision;
  v_sub_after double precision;
  v_base double precision;
  v_surcharge double precision;
  v_total double precision;
BEGIN
  IF p_discount_type = 'percent' THEN
    v_disc := js_round2(p_items_total * v_disc_raw / 100.0::float8);
  ELSE
    v_disc := v_disc_raw;
  END IF;
  v_sub_after := GREATEST(0::float8, p_items_total - v_disc);
  v_base := v_sub_after + GREATEST(0::float8, p_transport);  -- clamp transporte (incl. -1)
  IF p_payment = 'credit_card' THEN
    v_surcharge := js_round2(v_base * 0.05::float8);  -- CREDIT_CARD_SURCHARGE
  ELSE
    v_surcharge := 0::float8;
  END IF;
  v_total := js_round2(v_base + v_surcharge);
  RETURN jsonb_build_object('subtotal', p_items_total, 'surcharge', v_surcharge, 'total', v_total);
END;
$$;

-- 4) compute_order_totals — lee DB y delega en compute_totals_raw. READ-ONLY.
CREATE OR REPLACE FUNCTION compute_order_totals(p_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_items_total double precision;
  v_discount double precision;
  v_type text;
  v_transport double precision;
  v_payment text;
BEGIN
  -- itemsTotal = round2(Σ line_total). En float8: la suma de 2-decimales es exacta.
  SELECT js_round2(COALESCE(SUM(line_total::float8), 0::float8))
    INTO v_items_total FROM pt_order_items WHERE order_id = p_order_id;

  SELECT COALESCE(discount, 0)::float8,
         COALESCE(discount_type, 'fixed'),
         COALESCE(transport_cost_confirmed, 0)::float8,
         payment_method
    INTO v_discount, v_type, v_transport, v_payment
    FROM pt_orders WHERE id = p_order_id;

  RETURN compute_totals_raw(v_items_total, v_discount, v_type, v_transport, v_payment);
END;
$$;

-- 5) recalc_order_totals — compute + UPDATE atómico.
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

-- 6) create_order — insert order+items en UNA transacción; idempotente por key.
CREATE OR REPLACE FUNCTION create_order(p_order jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_id  bigint;
  v_num bigint;
  v_key uuid := NULLIF(p_order->>'idempotency_key', '')::uuid;
  v_constraint text;
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
  -- SOLO tratamos como dedup la colisión de la idempotency_key. Cualquier otra
  -- unique (order_number, items, etc.) se RE-LANZA → rollback + error real
  -- (nunca un deduped:true falso que pierda el pedido en silencio).
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_key IS NOT NULL AND v_constraint = 'idx_pt_orders_idempotency_key' THEN
    SELECT id, order_number INTO v_id, v_num FROM pt_orders WHERE idempotency_key = v_key;
    RETURN jsonb_build_object('id', v_id, 'order_number', v_num, 'deduped', true);
  END IF;
  RAISE;
END;
$$;

-- 7) Seguridad: SOLO service_role ejecuta (el server llama con supabaseAdmin).
REVOKE ALL ON FUNCTION js_round2(double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION compute_totals_raw(double precision, double precision, text, double precision, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION compute_order_totals(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION recalc_order_totals(bigint)  FROM PUBLIC;
REVOKE ALL ON FUNCTION create_order(jsonb, jsonb)   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION js_round2(double precision) TO service_role;
GRANT EXECUTE ON FUNCTION compute_totals_raw(double precision, double precision, text, double precision, text) TO service_role;
GRANT EXECUTE ON FUNCTION compute_order_totals(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION recalc_order_totals(bigint)  TO service_role;
GRANT EXECUTE ON FUNCTION create_order(jsonb, jsonb)   TO service_role;

-- ============================================================================
-- VERIFICACIÓN (después)
-- ============================================================================
-- 1) Columna + índice + 5 functions existen:
--      SELECT proname FROM pg_proc WHERE proname IN
--      ('js_round2','compute_totals_raw','compute_order_totals','recalc_order_totals','create_order'); -- 5
-- 2) Permisos: anon/authenticated NO ejecutan (proacl solo service_role=X):
--      SELECT proname, proacl FROM pg_proc WHERE proname IN
--      ('js_round2','compute_totals_raw','compute_order_totals','recalc_order_totals','create_order');
-- 3) Sanity float8 en el caso que ANTES divergía (debe dar surcharge 2.11, no 2.12):
--      SELECT compute_totals_raw(42.30::float8, 0::float8, 'fixed', 0::float8, 'credit_card');
--      -- esperado: {"subtotal":42.30,"surcharge":2.11,"total":44.41}
--
-- ============================================================================
-- POST-CHECK (OBLIGATORIO antes de mergear el código del ítem 4)
-- ============================================================================
--   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-recalc-rpc.mjs
--   → 0 divergencias en pedidos reales Y en los sintéticos (.10/.30/.70/.90 + tarjeta + %).
--
-- ROLLBACK (si NO se deployó el código que los usa):
--   DROP FUNCTION IF EXISTS create_order(jsonb, jsonb);
--   DROP FUNCTION IF EXISTS recalc_order_totals(bigint);
--   DROP FUNCTION IF EXISTS compute_order_totals(bigint);
--   DROP FUNCTION IF EXISTS compute_totals_raw(double precision, double precision, text, double precision, text);
--   DROP FUNCTION IF EXISTS js_round2(double precision);
--   DROP INDEX IF EXISTS idx_pt_orders_idempotency_key;
--   ALTER TABLE pt_orders DROP COLUMN IF EXISTS idempotency_key;
-- ============================================================================
