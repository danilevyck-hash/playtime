-- ============================================================================
-- Migration: Cerrar la escritura pública (anon) en 3 tablas y en el bucket de imágenes
-- File:      2026-11-17_cerrar_escritura_anon.sql
-- ============================================================================
--
-- PROBLEMA (medido en producción el 17-nov-2026, solo lectura de pg_policies)
--   pt_settings, pt_custom_products y pt_product_overrides tienen:
--     · "anon_all"  FOR ALL TO public USING (true) WITH CHECK (true)
--     · "anon_insert_<tabla>", "anon_update_<tabla>", "anon_delete_<tabla>"  TO anon
--   → cualquiera con la llave pública del navegador puede escribir y BORRAR la
--     configuración del sitio, los productos personalizados y los overrides.
--   storage.objects tiene "Allow public upload" (INSERT) y "Allow public update"
--   (UPDATE) TO public sobre el bucket `playtime-images` → cualquiera sube o pisa
--   imágenes del catálogo. La migración 2026-07-18 no las quitó porque buscaba
--   roles = {anon} y estas están concedidas a {public}.
--
-- POR QUÉ NO ROMPE NADA (verificado en el código, rama feat/marcacion-planilla)
--   · Ninguna escritura sale del navegador con la llave anon: grep de
--     .insert/.update/.upsert/.delete/storage.upload en src/ → todas en /api/*
--     con supabaseAdmin (service_role, que SALTA la RLS). El navegador solo LEE
--     pt_settings / pt_custom_products / pt_product_overrides (supabase-data.ts,
--     catalogo/[category]/page.tsx) y escucha realtime (ProductsProvider).
--   · Las políticas de SELECT para anon se CONSERVAN: el catálogo público sigue
--     leyendo igual. Las imágenes se sirven por /object/public/… que no pasa por
--     estas políticas; subirlas sigue siendo por /api/upload con service_role.
--
-- FILAS DE DATOS QUE TOCA: 0. Solo quita políticas: 12 en tablas + 2 en storage.
--
-- GATE — correr ANTES (esperado: 12 filas y 2 filas)
--   SELECT tablename, policyname, roles::text, cmd FROM pg_policies
--     WHERE tablename IN ('pt_settings','pt_custom_products','pt_product_overrides')
--       AND cmd IN ('ALL','INSERT','UPDATE','DELETE') ORDER BY 1,2;
--   SELECT policyname, cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
--     AND cmd IN ('INSERT','UPDATE','ALL')
--     AND COALESCE(qual,'') || COALESCE(with_check,'') ILIKE '%playtime-images%';
-- ============================================================================

-- 1) Tablas: fuera toda escritura pública; queda SOLO el SELECT de anon.
DROP POLICY IF EXISTS "anon_all"                          ON pt_settings;
DROP POLICY IF EXISTS "anon_insert_pt_settings"           ON pt_settings;
DROP POLICY IF EXISTS "anon_update_pt_settings"           ON pt_settings;
DROP POLICY IF EXISTS "anon_delete_pt_settings"           ON pt_settings;

DROP POLICY IF EXISTS "anon_all"                          ON pt_custom_products;
DROP POLICY IF EXISTS "anon_insert_pt_custom_products"    ON pt_custom_products;
DROP POLICY IF EXISTS "anon_update_pt_custom_products"    ON pt_custom_products;
DROP POLICY IF EXISTS "anon_delete_pt_custom_products"    ON pt_custom_products;

DROP POLICY IF EXISTS "anon_all"                          ON pt_product_overrides;
DROP POLICY IF EXISTS "anon_insert_pt_product_overrides"  ON pt_product_overrides;
DROP POLICY IF EXISTS "anon_update_pt_product_overrides"  ON pt_product_overrides;
DROP POLICY IF EXISTS "anon_delete_pt_product_overrides"  ON pt_product_overrides;

-- 2) Bucket playtime-images: fuera subir/pisar desde el navegador. La lectura pública queda.
DROP POLICY IF EXISTS "Allow public upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update" ON storage.objects;

-- ============================================================================
-- VERIFICACIÓN — correr DESPUÉS
--   -- 0 filas: ya no hay escritura pública en las 3 tablas
--   SELECT tablename, policyname FROM pg_policies
--     WHERE tablename IN ('pt_settings','pt_custom_products','pt_product_overrides')
--       AND cmd IN ('ALL','INSERT','UPDATE','DELETE') AND NOT ('service_role' = ANY(roles));
--   -- 3+ filas: el SELECT de anon sigue (anon_select / anon_select_<tabla>)
--   SELECT tablename, policyname FROM pg_policies
--     WHERE tablename IN ('pt_settings','pt_custom_products','pt_product_overrides') AND cmd='SELECT';
--   -- 0 filas: nadie sube ni pisa playtime-images sin service_role
--   SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
--     AND cmd IN ('INSERT','UPDATE','ALL')
--     AND COALESCE(qual,'') || COALESCE(with_check,'') ILIKE '%playtime-images%';
--
-- POST-CHECK funcional: /catalogo carga productos e imágenes; desde /admin se
-- guarda un ajuste del sitio, un producto personalizado y se sube una foto.
--
-- NOTA (fuera de alcance, para decidir aparte): `product-images` y `receipts`
-- son buckets de OTRA app del mismo proyecto y también admiten INSERT/UPDATE
-- públicos; no se tocan aquí. Y pt_settings sigue siendo legible por anon
-- entera (el catálogo lo necesita): no guardar ahí nada privado.
--
-- ROLLBACK: recrear, p. ej.
--   CREATE POLICY "anon_all" ON pt_settings FOR ALL TO public USING (true) WITH CHECK (true);
--   CREATE POLICY "Allow public upload" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'playtime-images');
-- (preferible arreglar hacia adelante antes que reabrir).
-- ============================================================================
