-- ============================================================
-- PlayTime v3 Migration: Products from constants.ts → Supabase
-- Run this in Supabase SQL Editor after backing up.
-- ============================================================

-- ─── Table: pt_products ───
CREATE TABLE IF NOT EXISTS pt_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  max_quantity INTEGER,
  variant_label TEXT,  -- e.g. "Color", "Tamaño", "Modelo"
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pt_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_pt_products" ON pt_products FOR SELECT TO anon USING (TRUE);
CREATE POLICY "auth_all_pt_products" ON pt_products FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ─── Table: pt_product_variants ───
CREATE TABLE IF NOT EXISTS pt_product_variants (
  id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES pt_products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price NUMERIC,  -- null means use product price
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, id)
);

ALTER TABLE pt_product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_pt_product_variants" ON pt_product_variants FOR SELECT TO anon USING (TRUE);
CREATE POLICY "auth_all_pt_product_variants" ON pt_product_variants FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- INSERT ALL 77 PRODUCTS FROM constants.ts
-- ============================================================

-- ═══ PLANES (sort_order 0-3) ═══
INSERT INTO pt_products (id, name, category, description, price, image_url, active, featured, max_quantity, variant_label, sort_order) VALUES
('plan-1', 'Plan #1 - Completo', 'planes', 'Show de Títeres con Lala (45 min), actividad de arte (3 atriles con 30 dibujos), alquiler de equipos (caballitos, piscina de bolas, túnel, mini parque y pads de piso). 2 teachers. Duración: 3 horas.', 500, '/images/products/plan-1.png', true, true, null, null, 0),
('plan-2', 'Plan #2 - Show + Equipos', 'planes', 'Show de Títeres con Lala (45 min), alquiler de equipos (caballitos, piscina de bolas, túnel, mini parque y pads de piso). 2 teachers. Duración: 3 horas.', 380, '/images/products/plan-2.png', true, true, null, null, 1),
('plan-3', 'Plan #3 - Show + Arte', 'planes', 'Show de Títeres con Lala (45 min), actividad de arte (3 atriles con 30 dibujos). 2 teachers. Duración: 3 horas.', 260, '/images/products/plan-3.png', true, false, null, null, 2),
('plan-12', 'Plan #12 - Cumpleaños Mommy & Me', 'planes', 'Celebra junto a tus amigas y sus hijos. Actividades de motricidad fina y gruesa, sensoriales, musicales, mini show de títeres y transporte. 15 niños. 3 teachers. Duración: 3 horas.', 450, '/images/products/plan-12.png', true, false, null, null, 3);

-- ═══ SPA (sort_order 4-8) ═══
INSERT INTO pt_products (id, name, category, description, price, image_url, active, featured, max_quantity, variant_label, sort_order) VALUES
('plan-6-makeup', 'Plan #6 - Makeup / Pintacarita Birthday', 'spa', 'Kit completo de maleta de maquillaje con espejo y luz. 1 teacher. Duración: 2 horas. Extras: Maquillaje Deluxe con brillantes ($10), Facial ($10), Teacher extra ($80).', 120, '/images/products/plan-6-makeup.png', true, true, null, null, 4),
('plan-7-manicure', 'Plan #7 - Princess Manicure', 'spa', 'Mesa de madera, alfombra, 4 sillas Tiffany, decoración de mesa. Pintura de uñas y sticker. 1 teacher. Duración: 2 horas. Extra teacher ($80).', 100, '/images/products/plan-7-manicure.png', true, false, null, null, 5),
('plan-9-hair', 'Plan #9 - Hair Glamour', 'spa', 'Peinado con trenzas de colores y todo su kit, coronitas para princesas, kit completo de maleta de peinado con espejo y luz, silla alta. 1 teacher. Duración: 2 horas. Extras: Teacher extra ($80), extensiones ($50).', 140, '/images/products/plan-9-hair.png', true, false, null, null, 6),
('plan-10-spa', 'Plan #10 - Home Beauty & Spa', 'spa', '1.5 horas de belleza y diversión. Peinado y maquillaje especial para cumpleañera, manicure express, 3 pedicure spa, peinado con coronita. 2 mesas, 6 sillas Tiffany, alfombras, decoración. 15 niñas máximo. 3 teachers.', 400, '/images/products/plan-10-spa.png', true, true, null, null, 7),
('plan-11-princess', 'Plan #11 - Princess Birthday', 'spa', 'Niñas ilimitadas. Animación con modelaje y baile, música, pink carpet, peinado con extensiones y coronitas, manicure deluxe, pedicure spa, masaje facial, tarima para modelaje, carpa de decoración, maquillaje especial para cumpleañera. 5 teachers. Duración: 3 horas.', 700, '/images/products/plan-11-princess.png', true, true, null, null, 8);

-- ═══ SHOW (sort_order 9-12) ═══
INSERT INTO pt_products (id, name, category, description, price, image_url, active, featured, max_quantity, variant_label, sort_order) VALUES
('show-titeres', 'Show de Títeres con Lala', 'show', 'Show de títeres interactivo con Lala. Duración: 45 minutos.', 225, null, true, false, null, null, 9),
('animacion', 'Animación 1 Hora', 'show', 'Animación por 1 hora con juegos y competencias.', 250, null, true, false, null, null, 10),
('personaje-animacion', 'Personaje con Animación', 'show', 'Animación con personajes temáticos. Preguntar por personaje de su interés.', 380, '/images/products/personaje-animacion.png', true, false, null, null, 11),
('personaje-fotos', 'Personaje 1 Hora (Saludos y Fotos)', 'show', 'Personaje temático por 1 hora para saludos y fotos. Preguntar por personaje de su interés.', 150, '/images/products/personaje-animacion.png', true, false, null, null, 12);

-- ═══ SNACKS (sort_order 13-17) ═══
INSERT INTO pt_products (id, name, category, description, price, image_url, active, featured, max_quantity, variant_label, sort_order) VALUES
('algodon-azucar', 'Algodón de Azúcar', 'snacks', 'Máquina de algodón de azúcar. 100% Kosher. Personal y materiales incluidos. Duración: 3 horas.', 100, '/images/products/algodon-azucar.png', true, false, null, null, 13),
('algodon-automatico', 'Algodón de Azúcar (Máquina Automática)', 'snacks', 'Máquina automática de algodón de azúcar. Personal y materiales incluidos. Duración: 3 horas.', 140, '/images/products/snacks-auto.jpg', true, false, null, null, 14),
('raspado', 'Raspado', 'snacks', 'Máquina de raspado. 100% Kosher. Personal y materiales incluidos. Duración: 3 horas.', 130, '/images/products/algodon-azucar.png', true, false, null, null, 15),
('popcorn', 'Pop Corn', 'snacks', 'Máquina de palomitas. 100% Kosher. Personal y materiales incluidos. Duración: 3 horas.', 100, '/images/products/popcorn.png', true, false, null, null, 16),
('slushy', 'Slushy', 'snacks', 'Máquina de slushy. 100% Kosher. Personal y materiales incluidos. Duración: 3 horas.', 130, '/images/products/popcorn.png', true, false, null, null, 17);

-- ═══ SOFT PLAY (sort_order 18-23) ═══
INSERT INTO pt_products (id, name, category, description, price, image_url, active, featured, max_quantity, variant_label, sort_order) VALUES
('gymboree-blanco-grande', 'Gymboree Blanco Grande', 'softplay', 'Cerca blanca, pads de piso, carritos foam blanco, mini parque, túnel gym redondo, lego foam, roller coaster blanco, piscina blanca.', 250, '/images/products/gymboree-blanco-grande.png', true, true, null, null, 18),
('gymboree-blanco-chico', 'Gymboree Blanco Chico', 'softplay', 'Cerca blanca, pads de piso, piscina blanca, túnel de gym, carritos foam blanco, lego foam, mini parque.', 160, '/images/products/gymboree-blanco-chico.png', true, false, null, null, 19),
('gymboree-rosado-grande', 'Gymboree Rosado Grande', 'softplay', 'Cerca rosada, pads rosado, caballito rosado, mini parque, puente rosado, piscina de flor con bolas rosadas, lego foam rosado, túnel gym rosado, caballitos saltarín rosado, roller coaster rosado.', 290, '/images/products/gymboree-blanco-grande.png', true, false, null, null, 20),
('gymboree-nina-mixto', 'Gymboree Niña Mixto', 'softplay', 'Cerca rosada, pads blanco, caballito rosado, piscina de flor con bolas blancas, roller coaster rosado, túnel gym blanco, puente rosado, mini parque rosado, lego foam mixto.', 285, '/images/products/gymboree-nina-mixto.png', true, false, null, null, 21),
('gymboree-rosado-chico', 'Gymboree Rosado Chico', 'softplay', 'Cerca rosada, pads rosado, caballito rosado, mini parque, puente rosado, piscina redonda rosada, lego foam rosado.', 180, '/images/products/gymboree-rosado-chico.png', true, false, null, null, 22),
('set-colchoneta-escalera', 'Set Colchoneta Escalera', 'softplay', 'Set de colchoneta con escalera para actividades motrices.', 220, '/images/products/gymboree-blanco-grande.png', true, false, null, null, 23);

-- ═══ BOUNCES (sort_order 24-31) ═══
INSERT INTO pt_products (id, name, category, description, price, image_url, active, featured, max_quantity, variant_label, sort_order) VALUES
('bubble-house', 'Bubble House', 'bounces', '3 metros la bola x 1.80 metros túnel.', 190, '/images/products/bubble-house.png', true, false, null, null, 24),
('bounce-house-blanco', 'Bounce House Blanco', 'bounces', 'Sin decoración. Dimensiones: 3.50W x 3.50L x 3.96H metros.', 120, '/images/products/bounce-house-blanco.png', true, false, null, null, 25),
('inflable-grande-1', 'Inflable Grande con Tobogán', 'bounces', 'Dimensiones: 5.4 x 5 x 4 metros.', 170, '/images/products/inflable-grande-1.png', true, false, null, null, 26),
('inflable-mediano', 'Inflable Mediano', 'bounces', 'Dimensiones: 4.4 x 4 x 3.8 metros.', 140, '/images/products/inflable-mediano.png', true, false, null, null, 27),
('inflable-grande-2', 'Inflable Grande', 'bounces', 'Dimensiones: 5.5 x 4.5 metros.', 170, '/images/products/inflable-grande-2.png', true, false, null, null, 28),
('inflable-chico', 'Inflable Pequeño', 'bounces', 'Dimensiones: 3L x 3W x 2.75H metros.', 110, '/images/products/inflable-chico.png', true, false, null, null, 29),
('inflable-mini-1', 'Inflable Mini (2.7m)', 'bounces', 'Dimensiones: 2.7 x 2.2 x 2.0 metros.', 90, '/images/products/inflable-mini-1.png', true, false, null, null, 30),
('inflable-mini-2', 'Inflable Mini (2.5m)', 'bounces', 'Dimensiones: 2.5 x 2.5 metros.', 90, '/images/products/inflable-mini-1.png', true, false, null, null, 31);

-- ═══ BALL PIT & SLIDES (sort_order 32-33) ═══
INSERT INTO pt_products (id, name, category, description, price, image_url, active, featured, max_quantity, variant_label, sort_order) VALUES
('piscina-bolas', 'Piscina de Bolas', 'ballpit', 'Disponible en diferentes formas y tamaños.', 40, '/images/products/piscina-redonda-grande.png', true, false, null, 'Modelo', 32),
('tunel', 'Túnel', 'ballpit', 'Disponible en blanco y rosado.', 40, '/images/products/tunel-grande.png', true, false, null, 'Tamaño', 33);

-- ═══ ADD-ONS (sort_order 34-48) ═══
INSERT INTO pt_products (id, name, category, description, price, image_url, active, featured, max_quantity, variant_label, sort_order) VALUES
('surraderos-arco', '2 Surraderos y Arco', 'addons', '2 surraderos y arco. No incluye piscina.', 100, '/images/products/surraderos-arco.png', true, false, null, null, 34),
('surradero-sencillo', 'Surradero Sencillo para Piscina', 'addons', 'Surradero sencillo para piscina.', 50, '/images/products/surraderos-arco.png', true, false, null, null, 35),
('mini-parque', 'Mini Parque', 'addons', 'Mini parque blanco (70.7 x 57") o rosado (59 x 46 x 47").', 50, '/images/products/mini-parque.png', true, false, null, 'Color', 36),
('pads-piso', 'Pads de Piso', 'addons', 'Disponible en blanco, turquesa y rosado. Dimensiones: 5 x 5 metros.', 50, null, true, false, null, 'Color', 37),
('bumper-cars', 'Bumper Cars (4 carritos)', 'addons', 'Incluye pads, pista y 4 carritos por 3 horas con personal.', 250, '/images/products/bumper-cars.png', true, true, null, null, 38),
('racing-cars', 'Racing Cars', 'addons', 'Carritos de carrera para niños.', 75, '/images/products/racing-cars.png', true, false, null, null, 39),
('caballito-saltarin', 'Caballito Saltarín', 'addons', 'Caballito saltarín individual.', 50, null, true, false, null, null, 40),
('silla-bebe', 'Silla para Bebé', 'addons', 'Silla individual para bebé.', 2, null, true, false, 20, null, 41),
('silla-tiffany', 'Silla Tiffany', 'addons', 'Silla Tiffany individual.', 3, null, true, false, 20, null, 42),
('mesa-ninos', 'Mesa para Niños', 'addons', 'Mesa individual para niños.', 15, null, true, false, 10, null, 43),
('mesa-madera', 'Mesa de Madera', 'addons', 'Mesa de madera individual.', 25, null, true, false, 10, null, 44),
('lego-foam', 'Lego Foam (set)', 'addons', 'Set de legos de foam.', 15, null, true, false, null, 'Color', 45),
('roller-coaster', 'Roller Coaster', 'addons', 'Roller coaster individual.', 25, null, true, false, null, 'Color', 46),
('cerca', 'Cerca', 'addons', 'Cerca individual.', 15, null, true, false, null, 'Color', 47),
('palo-pinata', 'Palo de Piñata', 'addons', 'Palo de piñata (no incluye piñata).', 20, null, true, false, null, null, 48),
('silla-cubo-10', 'Silla / Cubo', 'addons', 'Silla o cubo individual.', 10, null, true, false, 20, null, 49);

-- ═══ CREATIVE STUDIO (sort_order 50-76) ═══
INSERT INTO pt_products (id, name, category, description, price, image_url, active, featured, max_quantity, variant_label, sort_order) VALUES
('magic-wand', 'Magic Wand or Sword Crafting', 'creative', 'Construye y decora tus varitas y espadas mágicas desde cero, agregando detalles brillantes y detalles únicos.', 0, '/images/manualidades/page2_img3.png', true, false, null, null, 50),
('art-reveal', 'Art Reveal', 'creative', 'Pinta, raspa y descubre un arte sorpresa con la magia de tu personaje favorito.', 0, '/images/manualidades/page2_img4.png', true, false, null, null, 51),
('american-girl-party', 'American Girl Party', 'creative', 'Peina, viste y decora a tu muñeca con artes, accesorios y peinados para horas de juego.', 0, '/images/manualidades/page2_img5.png', true, false, null, null, 52),
('diy-facial-mask', 'DIY Facial Mask', 'creative', 'Mezcla y prepara tu propia mascarilla facial divertida y relajante.', 0, '/images/manualidades/page3_img3.png', true, false, null, null, 53),
('stamp-it-up', 'Stamp It Up', 'creative', 'Personaliza tu maleta con serigrafía y haz que sea tan única como tú.', 0, '/images/manualidades/page3_img2.png', true, false, null, null, 54),
('style-sneakers', 'Style Your Sneakers', 'creative', 'Diseña y transforma tus zapatillas en un accesorio lleno de estilo y personalidad.', 0, '/images/manualidades/page3_img5.png', true, false, null, null, 55),
('slime-bar', 'Slime Bar', 'creative', 'Crea tu slime único! Elige el color, agrega un aroma divertido, mezcla la textura perfecta y decoraciones mágicas.', 0, '/images/manualidades/page4_img5.png', true, false, null, null, 56),
('build-a-plush', 'Build-A-Plush', 'creative', 'Da vida a tu propio peluche! Rellénalo, graba un mensaje especial en su corazón, recibe su certificado y decora su casita.', 0, '/images/manualidades/page4_img6.png', true, false, null, null, 57),
('squishmallow-pillows', 'Squishmallow Pillows', 'creative', 'Crea tu almohada squishy, suave y adorable para abrazar siempre! Personalízala con tu aroma favorito.', 0, '/images/manualidades/page4_img7.png', true, false, null, null, 58),
('charm-it-up', 'Charm It Up!', 'creative', 'Decora espejos, lámparas, cartucheras, botellas y mucho más con whipped cream glue y montones de charms.', 0, '/images/manualidades/page5_img3.png', true, false, null, null, 59),
('clay-creations', 'Clay Creations', 'creative', 'Moldea masilla y crea animalitos y pastelitos únicos con tus manos.', 0, '/images/manualidades/page5_img5.png', true, false, null, null, 60),
('snow-globes', 'Snow Globes', 'creative', 'Crea tu propia bola de nieve con luz! Elige tu personaje favorito, decórala a tu estilo y llévate un recuerdo brillante.', 0, '/images/manualidades/page5_img6.png', true, false, null, null, 61),
('mommy-and-me', 'Mommy & Me Sensory Play', 'creative', 'Actividades sensoriales y de motricidad fina basada en el tema de tu cumpleaños.', 0, '/images/manualidades/page6_img3.png', true, false, null, null, 62),
('shrink-dink', 'Shrink Dink Keychains', 'creative', 'Dibuja, colorea y mira tu diseño encogerse mágicamente! Luego arma tu llavero único.', 0, '/images/manualidades/page6_img4.png', true, false, null, null, 63),
('character-keychain', 'Character Keychain', 'creative', 'Elige tu personaje favorito, conviértelo en un llavero único y decóralo con tus beads favoritos.', 0, '/images/manualidades/page6_img5.png', true, false, null, null, 64),
('custom-tshirt', 'Custom T-shirt Design', 'creative', 'Pinta y decora tu tshirt con un diseño personalizado.', 0, '/images/manualidades/page7_img3.png', true, false, null, null, 65),
('unicorn-horn', 'Unicorn Horn Cones', 'creative', 'Decora conos mágicos de unicornio llenos de colores y fantasía!', 0, '/images/manualidades/page7_img4.png', true, false, null, null, 66),
('mickey-ears', 'Mickey & Minnie Magic Ears', 'creative', 'Diseña tus propias orejitas mágicas con colores, brillos y accesorios para un look mágico y divertido.', 0, '/images/manualidades/page7_img5.png', true, false, null, null, 67),
('patch-sparkle', 'Patch & Sparkle', 'creative', 'Decora lazos, kippot, maletas, libretas y monederos con parches y estilo único!', 0, '/images/manualidades/page8_img3.png', true, false, null, null, 68),
('apron-art', 'Apron Art', 'creative', 'Personaliza tu delantal con colores, brillos y tu estilo único para divertirte mientras cocinas.', 0, '/images/manualidades/page8_img4.png', true, false, null, null, 69),
('cupcake-decorating', 'Cupcake & Cake Decorating', 'creative', 'Crea tu propia pizza, decora cupcakes o haz tu fruit kebab. Diversión y sabor en cada creación!', 0, '/images/manualidades/page8_img5.png', true, false, null, null, 70),
('magic-lab', 'Magic Lab', 'creative', 'Ciencia mágica para niños con experimentos sorprendentes que despiertan la curiosidad.', 0, '/images/manualidades/page9_img3.png', true, false, null, null, 71),
('potion-necklace', 'Potion Necklace', 'creative', 'Los niños mezclan líquidos de colores brillantes en pequeños frascos para crear un collar único en forma de poción mágica.', 0, '/images/manualidades/page9_img4.png', true, false, null, null, 72),
('sand-bottles', 'Sand Bottles', 'creative', 'Llena botellitas con arena de colores mágicos y crea un recuerdo brillante y especial!', 0, '/images/manualidades/page9_img5.png', true, false, null, null, 73),
('glitter-bottles', 'Glitter Bottles', 'creative', 'Botellas para rellenar con escarcha y decorarla con tus stickers favoritos.', 0, '/images/manualidades/page10_img3.png', true, false, null, null, 74),
('lava-lamp', 'Lava Lamp', 'creative', 'Haz tu propia lámpara de lava y observa cómo la magia cobra vida con burbujas de colores.', 0, '/images/manualidades/page10_img4.png', true, false, null, null, 75),
('holiday-crafts', 'Holiday Crafts', 'creative', 'Personaliza tu gorro de navidad con tu nombre, diseños de santa y mucho brillo.', 0, '/images/manualidades/page10_img5.png', true, false, null, null, 76),
('rhinestone-sparkle', 'Sparkle & Shine with Rhinestone', 'creative', 'Personaliza con rhinestones de colores y crea un diseño único que refleje tu estilo.', 0, '/images/manualidades/page11_img3.png', true, false, null, null, 77),
('bucket-hat', 'Design Your Own Bucket Hat', 'creative', 'Decora tu sombrero a tu estilo! Con pintura para tela, parches, pins y mucho color.', 0, '/images/manualidades/page11_img4.png', true, false, null, null, 78);

-- ============================================================
-- INSERT PRODUCT VARIANTS (7 products with variants)
-- ============================================================

-- Piscina de Bolas (5 variants)
INSERT INTO pt_product_variants (id, product_id, label, price, image_url, sort_order) VALUES
('redonda-chica', 'piscina-bolas', 'Redonda Pequeña · 1.5m', 40, null, 0),
('colores-60', 'piscina-bolas', 'Colores · 60"', 60, null, 1),
('peces', 'piscina-bolas', 'Peces · 1.3m', 85, null, 2),
('cuadrada', 'piscina-bolas', 'Cuadrada Foam · 72"', 88, null, 3),
('redonda-grande', 'piscina-bolas', 'Redonda Grande · 3m', 100, null, 4);

-- Túnel (3 variants)
INSERT INTO pt_product_variants (id, product_id, label, price, image_url, sort_order) VALUES
('chico', 'tunel', 'Pequeño · 1.50m', 45, null, 0),
('grande', 'tunel', 'Grande · 2.15m', 50, null, 1),
('largo', 'tunel', 'Largo · 4.26m', 40, null, 2);

-- Mini Parque (2 variants)
INSERT INTO pt_product_variants (id, product_id, label, price, image_url, sort_order) VALUES
('blanco', 'mini-parque', 'Blanco', null, null, 0),
('rosado', 'mini-parque', 'Rosado', null, null, 1);

-- Pads de Piso (3 variants)
INSERT INTO pt_product_variants (id, product_id, label, price, image_url, sort_order) VALUES
('blanco', 'pads-piso', 'Blanco', null, null, 0),
('rosado', 'pads-piso', 'Rosado', null, null, 1),
('turquesa', 'pads-piso', 'Turquesa', null, null, 2);

-- Lego Foam (2 variants)
INSERT INTO pt_product_variants (id, product_id, label, price, image_url, sort_order) VALUES
('blanco', 'lego-foam', 'Blanco', null, null, 0),
('rosado', 'lego-foam', 'Rosado', null, null, 1);

-- Roller Coaster (3 variants)
INSERT INTO pt_product_variants (id, product_id, label, price, image_url, sort_order) VALUES
('blanco', 'roller-coaster', 'Blanco', null, null, 0),
('rosado', 'roller-coaster', 'Rosado', null, null, 1),
('colores', 'roller-coaster', 'Multicolor', null, null, 2);

-- Cerca (2 variants)
INSERT INTO pt_product_variants (id, product_id, label, price, image_url, sort_order) VALUES
('blanco', 'cerca', 'Blanco', null, null, 0),
('rosado', 'cerca', 'Rosado', null, null, 1);

-- ============================================================
-- APPLY EXISTING OVERRIDES FROM pt_product_overrides
-- ============================================================
UPDATE pt_products p SET
  name = COALESCE(o.name_override, p.name),
  price = COALESCE(o.price_override, p.price),
  description = COALESCE(o.description_override, p.description),
  category = COALESCE(o.category_override, p.category),
  image_url = COALESCE(o.image_url, p.image_url),
  active = NOT COALESCE(o.disabled, false)
FROM pt_product_overrides o
WHERE o.id = p.id;

-- ============================================================
-- IMPORT CUSTOM PRODUCTS
-- ============================================================
INSERT INTO pt_products (id, name, category, description, price, image_url, active, sort_order)
SELECT id, name, category, description, price, image_url, active, 1000 + ROW_NUMBER() OVER ()
FROM pt_custom_products;

-- ============================================================
-- MIGRATE VARIANT IMAGES FROM pt_settings INTO pt_product_variants
-- This pulls variant_images_{productId} from pt_settings and updates
-- the image_url column on the corresponding variant rows.
-- ============================================================
DO $$
DECLARE
  r RECORD;
  variant_id TEXT;
  img_url TEXT;
BEGIN
  FOR r IN
    SELECT key, value FROM pt_settings
    WHERE key LIKE 'variant_images_%'
  LOOP
    FOR variant_id, img_url IN
      SELECT k, v::text FROM jsonb_each_text(r.value::jsonb)
    LOOP
      UPDATE pt_product_variants
      SET image_url = img_url
      WHERE product_id = replace(r.key, 'variant_images_', '')
        AND id = variant_id;
    END LOOP;
  END LOOP;
END $$;
