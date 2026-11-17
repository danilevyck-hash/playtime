-- ============================================================================
-- Migration: Marcación y planilla quincenal de la bodega
-- File:      2026-11-17_marcacion_planilla.sql
-- Tablas nuevas: pt_empleados · pt_marcaciones · pt_planilla · pt_marcacion_ajustes
-- Bucket nuevo:  marcaciones (PRIVADO)
-- ============================================================================
--
-- QUÉ HACE (en palabras simples)
--   Crea cuatro tablas vacías y un bucket privado para las selfies. Las cuatro
--   nacen con RLS encendida y SIN políticas: nadie entra con la llave pública
--   (anon); solo el servidor con service_role (que salta la RLS) lee y escribe,
--   desde /api/marcar y /api/planilla. No toca ninguna tabla existente.
--
-- FILAS QUE TOCA: 2 (los dos colaboradores de hoy, con su sueldo y SIN PIN:
--   el PIN lo escribe la Dirección desde Planilla › Colaboradores, y se guarda
--   con hash scrypt; nunca en texto). Más 1 fila en storage.buckets.
--
-- GATE — correr ANTES (esperado: 0 filas en las dos consultas)
--   SELECT tablename FROM pg_tables WHERE schemaname='public'
--     AND tablename IN ('pt_empleados','pt_marcaciones','pt_planilla','pt_marcacion_ajustes');
--   SELECT id FROM storage.buckets WHERE id = 'marcaciones';
-- ============================================================================

-- Colaboradores de bodega. pin_hash = 'scrypt:<salt>:<hash>' (lib/admin-auth.ts); NULL = todavía no puede marcar.
CREATE TABLE pt_empleados (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         text NOT NULL CHECK (length(btrim(nombre)) > 0),
  sueldo_mensual numeric(10,2) NOT NULL CHECK (sueldo_mensual >= 0),
  pin_hash       text,
  activo         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE pt_empleados IS 'Colaboradores de bodega (Playtime). El PIN va con hash scrypt, nunca en texto.';

-- Una marca = entrada o salida de UN día de Panamá. La hora la pone el servidor
-- (marcada_en). La corrección de la Dirección va ENCIMA (hora_corregida + firma):
-- la original nunca se borra ni se edita.
CREATE TABLE pt_marcaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id    uuid NOT NULL REFERENCES pt_empleados(id),
  fecha          date NOT NULL,                       -- día de Panamá (UTC−5)
  tipo           text NOT NULL CHECK (tipo IN ('entrada','salida')),
  marcada_en     timestamptz NOT NULL,                -- hora del servidor (o la que escribió la Dirección si origen='direccion')
  lat            double precision,
  lng            double precision,
  precision_m    integer,
  distancia_m    integer,                             -- a la bodega, calculada en el servidor
  foto_path      text,                                -- en el bucket privado `marcaciones`
  origen         text NOT NULL DEFAULT 'telefono' CHECK (origen IN ('telefono','direccion')),
  hora_corregida timestamptz,
  corregida_por  text,
  corregida_en   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empleado_id, fecha, tipo),
  CHECK ((hora_corregida IS NULL) = (corregida_en IS NULL))
);
CREATE INDEX pt_marcaciones_fecha_idx ON pt_marcaciones (fecha);
COMMENT ON TABLE pt_marcaciones IS 'Entrada/salida por día. La marca del teléfono no se edita: la corrección va en hora_corregida con firma.';

-- Lo que la Dirección decide por quincena: si se pagan las horas extra.
CREATE TABLE pt_planilla (
  empleado_id      uuid NOT NULL REFERENCES pt_empleados(id),
  quincena_desde   date NOT NULL,                     -- día 1 o 16 del mes
  extras_aprobadas boolean NOT NULL DEFAULT false,
  decidido_en      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empleado_id, quincena_desde),
  CHECK (extract(day FROM quincena_desde) IN (1, 16))
);

-- Punto de la bodega y radio. Una sola fila (id = 1). La fija la Dirección parada en la bodega.
CREATE TABLE pt_marcacion_ajustes (
  id        smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lat       double precision NOT NULL,
  lng       double precision NOT NULL,
  radio_m   integer NOT NULL DEFAULT 150 CHECK (radio_m BETWEEN 20 AND 2000),
  fijado_en timestamptz NOT NULL DEFAULT now()
);

-- RLS encendida, cero políticas → anon y authenticated no ven ni escriben nada; service_role sí.
ALTER TABLE pt_empleados          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt_marcaciones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt_planilla           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt_marcacion_ajustes  ENABLE ROW LEVEL SECURITY;

-- Selfies: bucket PRIVADO; se sirven con URL firmada de 1 h solo a la Dirección.
INSERT INTO storage.buckets (id, name, public)
VALUES ('marcaciones', 'marcaciones', false)
ON CONFLICT (id) DO NOTHING;

-- Los dos colaboradores de hoy. Sin PIN: lo pone la Dirección en Planilla › Colaboradores.
INSERT INTO pt_empleados (nombre, sueldo_mensual) VALUES
  ('Joseph Alberto Alain Adames', 600.00),
  ('Cristhian Geovanny Hondoy Diaz', 700.00);

-- ============================================================================
-- VERIFICACIÓN — correr DESPUÉS
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'
--     AND tablename IN ('pt_empleados','pt_marcaciones','pt_planilla','pt_marcacion_ajustes');
--     -- esperado: 4 filas, rowsecurity = true
--   SELECT count(*) FROM pg_policies WHERE tablename IN
--     ('pt_empleados','pt_marcaciones','pt_planilla','pt_marcacion_ajustes');   -- esperado: 0
--   SELECT nombre, sueldo_mensual, pin_hash IS NULL AS sin_pin FROM pt_empleados; -- 2 filas, sin_pin = true
--   SELECT id, public FROM storage.buckets WHERE id = 'marcaciones';            -- public = false
--
-- ROLLBACK (si hiciera falta, en este orden):
--   DROP TABLE pt_planilla; DROP TABLE pt_marcaciones; DROP TABLE pt_marcacion_ajustes; DROP TABLE pt_empleados;
--   DELETE FROM storage.buckets WHERE id = 'marcaciones';  -- solo si está vacío
-- ============================================================================
