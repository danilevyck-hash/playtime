-- ============================================================================
-- Migration (GATE FUERTE): depósitos atómicos — backfill de id + RPC add/remove
-- File:      2026-06-06_order_deposits_rpc.sql
-- ============================================================================
--
-- CONTEXTO (ítem 2 Sprint 3, decisión A de Daniel = RPC sobre el JSONB `deposits`):
--   Hoy addDeposit/removeDeposit (admin/pedidos/[id]) arman el array COMPLETO en el
--   cliente y mandan deposits+depositAmount; la API hace update().eq SIN lock → dos
--   personas registrando un depósito a la vez = last-write-wins → un cobro se pierde
--   sin aviso (plata). Además los depósitos viejos no tienen `id`, así que no se pueden
--   borrar de forma estable.
--
-- Esta migración:
--   1) BACKFILL: agrega `id` (uuid) a cada depósito existente que no lo tenga.
--      IDEMPOTENTE y NO destructivo: solo añade la clave `id`; NO toca amount/date,
--      NO cambia el orden, NO cambia deposit_amount, NO toca filas ya backfilleadas.
--   2) add_deposit / remove_deposit: SELECT ... FOR UPDATE (serializa concurrencia),
--      mutan el JSONB y recalculan deposit_amount server-side (authoritative).
--   Los lectores actuales (detail page, PDF pdf-order.ts, badges de la lista) siguen
--   leyendo el mismo JSONB — la forma de los datos no cambia (solo se suma `id`).
--
-- ⚠️ TOCA DATOS DE PRODUCCIÓN (la columna deposits = plata). Correr con backup reciente.
-- ⚠️ APLICAR ANTES del código del ítem 2.
--
-- SUPUESTO (verificar en el GATE): cada elemento de `deposits` es un OBJETO {amount,date}
--   (es lo único que la app insertó). Si hubiera elementos no-objeto, el `||` fallaría;
--   el GATE incluye una query para detectarlos ANTES de correr el backfill.
--
-- ============================================================================
-- GATE (antes) — correr y ANOTAR (para comparar post-migración)
-- ============================================================================
-- 1) Funciones no deben existir aún:
--      SELECT proname FROM pg_proc WHERE proname IN ('add_deposit','remove_deposit'); -- 0
--
-- 2) Invariantes a preservar (anotar los 3 números):
--      SELECT
--        count(*) FILTER (WHERE jsonb_typeof(deposits)='array' AND jsonb_array_length(deposits)>0) AS orders_con_deposits,
--        COALESCE(SUM((SELECT count(*) FROM jsonb_array_elements(deposits))),0) AS total_depositos,
--        COALESCE(SUM((SELECT SUM((e->>'amount')::numeric) FROM jsonb_array_elements(deposits) e)),0) AS suma_montos
--      FROM pt_orders
--      WHERE deposits IS NOT NULL;
--
-- 3) ⚠️ PRE-CHEQUEO de seguridad — debe dar 0 (no hay elementos no-objeto):
--      SELECT count(*) AS malformados
--      FROM pt_orders, jsonb_array_elements(deposits) e
--      WHERE jsonb_typeof(deposits)='array' AND jsonb_typeof(e) <> 'object';
--      -- si NO es 0: PARAR y revisar a mano antes del backfill.
--
-- 4) Cuántos depósitos faltan id (los que el backfill va a tocar):
--      SELECT count(*) AS sin_id
--      FROM pt_orders, jsonb_array_elements(deposits) e
--      WHERE jsonb_typeof(deposits)='array' AND NOT (e ? 'id');
--
-- ============================================================================
-- MIGRACIÓN
-- ============================================================================

-- 1) BACKFILL — agrega `id` a cada depósito sin id. Preserva orden (WITH ORDINALITY
--    + ORDER BY), NO toca amount/date, NO recalcula deposit_amount. Idempotente: el
--    WHERE excluye filas cuyos depósitos ya tienen todos `id`.
UPDATE pt_orders o
SET deposits = (
  SELECT jsonb_agg(
           CASE WHEN elem ? 'id'
                THEN elem
                ELSE elem || jsonb_build_object('id', gen_random_uuid())
           END
           ORDER BY ord
         )
  FROM jsonb_array_elements(o.deposits) WITH ORDINALITY AS t(elem, ord)
)
WHERE jsonb_typeof(o.deposits) = 'array'
  AND jsonb_array_length(o.deposits) > 0
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(o.deposits) e WHERE NOT (e ? 'id')
  );

-- 2) add_deposit — append atómico con SELECT FOR UPDATE; recalcula deposit_amount.
CREATE OR REPLACE FUNCTION add_deposit(p_order_id bigint, p_amount numeric, p_date text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_deposits jsonb;
  v_new jsonb;
  v_total numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'deposit amount must be > 0';
  END IF;
  -- Lock de la fila → dos depósitos concurrentes se serializan (no last-write-wins).
  SELECT COALESCE(deposits, '[]'::jsonb) INTO v_deposits
    FROM pt_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  v_new := v_deposits || jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'amount', p_amount, 'date', p_date)
  );
  SELECT COALESCE(SUM((e->>'amount')::numeric), 0)
    INTO v_total FROM jsonb_array_elements(v_new) e;

  UPDATE pt_orders SET deposits = v_new, deposit_amount = v_total WHERE id = p_order_id;
  RETURN jsonb_build_object('deposits', v_new, 'deposit_amount', v_total);
END;
$$;

-- 3) remove_deposit — quita por id, atómico, recalcula deposit_amount.
CREATE OR REPLACE FUNCTION remove_deposit(p_order_id bigint, p_deposit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_deposits jsonb;
  v_new jsonb;
  v_total numeric;
BEGIN
  SELECT COALESCE(deposits, '[]'::jsonb) INTO v_deposits
    FROM pt_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  -- Reconstruye el array sin el depósito borrado, preservando orden.
  SELECT COALESCE(jsonb_agg(e ORDER BY ord), '[]'::jsonb) INTO v_new
    FROM jsonb_array_elements(v_deposits) WITH ORDINALITY AS t(e, ord)
    WHERE e->>'id' IS DISTINCT FROM p_deposit_id::text;

  SELECT COALESCE(SUM((e->>'amount')::numeric), 0)
    INTO v_total FROM jsonb_array_elements(v_new) e;

  UPDATE pt_orders SET deposits = v_new, deposit_amount = v_total WHERE id = p_order_id;
  RETURN jsonb_build_object('deposits', v_new, 'deposit_amount', v_total);
END;
$$;

-- 4) Seguridad: SOLO service_role ejecuta (el server llama con supabaseAdmin).
REVOKE ALL ON FUNCTION add_deposit(bigint, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION remove_deposit(bigint, uuid)       FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_deposit(bigint, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION remove_deposit(bigint, uuid)       TO service_role;

-- ============================================================================
-- VERIFICACIÓN (después) — los INVARIANTES del GATE deben mantenerse
-- ============================================================================
-- 1) TODO depósito tiene id ahora (debe dar 0):
--      SELECT count(*) AS sin_id
--      FROM pt_orders, jsonb_array_elements(deposits) e
--      WHERE jsonb_typeof(deposits)='array' AND NOT (e ? 'id');
--
-- 2) Mismos 3 números que el GATE (el backfill NO cambió nada de plata ni orden):
--      SELECT
--        count(*) FILTER (WHERE jsonb_typeof(deposits)='array' AND jsonb_array_length(deposits)>0) AS orders_con_deposits,
--        COALESCE(SUM((SELECT count(*) FROM jsonb_array_elements(deposits))),0) AS total_depositos,
--        COALESCE(SUM((SELECT SUM((e->>'amount')::numeric) FROM jsonb_array_elements(deposits) e)),0) AS suma_montos
--      FROM pt_orders WHERE deposits IS NOT NULL;
--      -- orders_con_deposits, total_depositos y suma_montos deben ser IDÉNTICOS al GATE.
--
-- 3) (Opcional) deposit_amount sigue cuadrando con la suma del JSONB por pedido:
--      SELECT id FROM pt_orders
--      WHERE deposits IS NOT NULL AND jsonb_typeof(deposits)='array'
--        AND COALESCE(deposit_amount,0) <> COALESCE((SELECT SUM((e->>'amount')::numeric) FROM jsonb_array_elements(deposits) e),0);
--      -- NOTA: si esta query devuelve filas, son descuadres PRE-EXISTENTES (no los crea
--      --        el backfill, que no toca deposit_amount). Anotarlos; los RPCs los corrigen
--      --        al próximo add/remove de ese pedido.
--
-- 4) Funciones + permisos:
--      SELECT proname, proacl FROM pg_proc WHERE proname IN ('add_deposit','remove_deposit');
--      -- 2 filas; proacl solo service_role=X.
--
-- ============================================================================
-- POST-CHECK funcional (con el código del ítem 2, después)
-- ============================================================================
-- (a) Agregar un depósito a un pedido → aparece con id, deposit_amount suma bien.
-- (b) Borrar ese depósito → desaparece, deposit_amount baja.
-- (c) Concurrencia: dos add_deposit casi simultáneos sobre el mismo pedido → ambos
--     quedan registrados (no se pisan); deposit_amount = suma de los dos.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS remove_deposit(bigint, uuid);
--   DROP FUNCTION IF EXISTS add_deposit(bigint, numeric, text);
--   -- El backfill de `id` es no-destructivo (solo agregó una clave); no se revierte
--   -- y es inofensivo para los lectores actuales. Si se quisiera, se podrían quitar
--   -- los id, pero NO es necesario.
-- ============================================================================
