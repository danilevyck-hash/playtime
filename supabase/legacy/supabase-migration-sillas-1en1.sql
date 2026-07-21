-- Migration: resetear sillas a step 1 / min 1 (vender unidad por unidad)
-- Ejecutar en Supabase SQL Editor (proyecto Apps Familia)

UPDATE pt_products
SET min_quantity = 1, quantity_step = 1
WHERE id IN ('silla-tiffany', 'silla-bebe', 'silla-cubo-10');
