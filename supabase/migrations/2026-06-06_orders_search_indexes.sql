-- ============================================================================
-- Migration (GATE SUAVE): índices para paginación + búsqueda server-side de pedidos
-- File:      2026-06-06_orders_search_indexes.sql
-- ============================================================================
--
-- CONTEXTO: el GET /api/orders ahora pagina (event_date DESC + range), filtra por
-- status/month y busca por nombre/teléfono (ilike) / order_number (eq), y
-- /api/orders/stats agrega sobre toda la tabla. Estos índices aceleran esas queries.
--
-- ⚠️ GATE SUAVE — NO bloqueante: el código FUNCIONA sin estos índices (Postgres hace
--    seq scan). Sin ellos = degradación de performance, NO ruptura. Aplicalo cuando
--    quieras; el deploy del código no depende de esto.
--
-- pt_orders es chica (cientos/miles de filas) → CREATE INDEX normal es casi instantáneo.
-- Si la tabla fuera grande, usar `CREATE INDEX CONCURRENTLY` (correr cada statement por
-- separado, fuera de transacción).
--
-- ============================================================================
-- GATE (opcional, antes) — ver si hoy hace seq scan en la búsqueda:
--   EXPLAIN ANALYZE
--   SELECT * FROM pt_orders
--   WHERE customer_name ILIKE '%ana%' OR customer_phone ILIKE '%ana%'
--   ORDER BY event_date DESC LIMIT 100;
--   -- esperado ANTES: Seq Scan. DESPUÉS: Bitmap Index Scan (gin_trgm).
-- ============================================================================
-- MIGRACIÓN
-- ============================================================================

-- Búsqueda ILIKE con comodín al inicio (%term%) necesita pg_trgm para usar índice.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_pt_orders_customer_name_trgm
  ON pt_orders USING gin (customer_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pt_orders_customer_phone_trgm
  ON pt_orders USING gin (customer_phone gin_trgm_ops);

-- Orden por event_date DESC + filtro de mes (rango sobre event_date).
CREATE INDEX IF NOT EXISTS idx_pt_orders_event_date
  ON pt_orders (event_date DESC);

-- Filtro por status (chips Pendientes/Confirmados/…).
CREATE INDEX IF NOT EXISTS idx_pt_orders_status
  ON pt_orders (status);

-- created_at (orden alternativo / reportes).
CREATE INDEX IF NOT EXISTS idx_pt_orders_created_at
  ON pt_orders (created_at DESC);

-- Nota: order_number suele tener índice por ser serial/único; si no, descomentar:
-- CREATE INDEX IF NOT EXISTS idx_pt_orders_order_number ON pt_orders (order_number);

-- ============================================================================
-- VERIFICACIÓN (después)
-- ============================================================================
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'pt_orders' AND indexname LIKE 'idx_pt_orders_%'
--   ORDER BY indexname;
--   -- esperado: las 5 (trgm name, trgm phone, event_date, status, created_at).
--
--   -- Re-correr el EXPLAIN del GATE → ahora debe usar el índice gin_trgm.
-- ============================================================================
