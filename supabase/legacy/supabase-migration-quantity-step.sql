-- Migration: agregar quantity_step y min_quantity para vender en paquetes
-- Run in Supabase SQL Editor (Apps Familia project)

ALTER TABLE pt_products ADD COLUMN IF NOT EXISTS min_quantity INT;
ALTER TABLE pt_products ADD COLUMN IF NOT EXISTS quantity_step INT;

-- Ejemplo de uso para sillas de $3.50 vendidas de 8 en 8:
-- UPDATE pt_products SET min_quantity = 8, quantity_step = 8 WHERE id = 'silla-tiffany';
