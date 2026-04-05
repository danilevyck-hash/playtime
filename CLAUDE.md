# PlayTime — Catálogo de Experiencias para Fiestas

Catálogo online para negocio de fiestas/cumpleaños en Panamá. El cliente elige categoría, selecciona productos, arma su paquete y hace pedido por WhatsApp.

## Stack
- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **Styling:** Tailwind CSS
- **PDF:** jsPDF + jspdf-autotable (factura de pedido con descuento, transporte, brand colors)

## Categorías (9)
planes (Experiences), spa (Spa Experience), show (Show & Personajes), snacks (Snack Bar), softplay (Soft Play), bounces (Bounces), ballpit (Ball Pit & Slides), addons (Add-Ons), creative (Creative Studio)

El orden de categorías es configurable desde admin (drag-and-drop) y se guarda en pt_settings key `category_order`.

## Módulos
| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Landing | `/` | Hero con confetti animado, servicios, productos destacados, testimonios, Instagram |
| Catálogo | `/catalogo` | Grid de 9 categorías → seleccionar una → ver productos. Sin toggle planes/custom |
| Carrito | `/carrito` | Persistencia en localStorage. Confirmación al eliminar con qty=1 |
| Checkout | `/checkout` | 4 pasos: datos → evento → pago → resumen. WhatsApp directo vía location.href |
| Confirmación | `/checkout/confirmacion` | Botón WhatsApp + datos bancarios + fallback teléfono |
| Admin | `/admin` | PIN protegido. 3 tabs: Pedidos, Catálogo, Sitio |

## Auth
- Admin: PIN validado en `/api/auth` con rate limiting (5 intentos / 15 min)
- Sesión: token en memoria (24h), comparación constant-time
- RLS: anon puede leer, solo authenticated/service_role puede escribir
- Env var: `ADMIN_PIN`, `SUPABASE_SERVICE_ROLE_KEY`

## Base de datos
- Schema en `supabase-migration.sql` y `supabase-migration-v2.sql`
- Tablas: pt_product_overrides, pt_custom_products, pt_settings, pt_orders, pt_order_items
- Columnas extras en pt_orders: deposits (JSONB), discount (NUMERIC)
- Storage bucket: `playtime-images` para fotos de productos y PDFs

## Branding
- Colores: purple (#580459), teal (#84D9D0), orange (#F27405), pink (#F27289), yellow (#F2C84B), cream (#FAF3E8)
- Fuente única: Chalet-LondonNineteenEighty (local, en src/app/fonts/)
- Doodles SVG custom por categoría (src/components/ui/CategoryDoodles.tsx)
- Confetti animado en Hero (CSS keyframes float-a/b/c, 8 blobs en móvil)

## Admin (`/admin`)
- 3 tabs: Pedidos, Catálogo (Productos + Categorías), Sitio
- Tab bar estilo iOS segmented control
- Skeleton shimmer al cargar (Apple-style)

### Pedidos
- Pipeline: Pendiente → Confirmado → Realizado
- Acciones rápidas arriba: WhatsApp, Editar, PDF, Eliminar (ícono sutil)
- Factura editable: qty/precio inline, agregar item con autocomplete de PRODUCTS, eliminar items
- Totales recalculados en vivo (subtotal, descuento, transporte, recargo, total)
- Pagos colapsable (cerrado por defecto): descuento, depósitos múltiples con fecha, transporte con auto-suggest por área
- Nota interna colapsable
- PDF con descuento, colores brand, recálculo desde items actuales
- Filtros con conteo: Todos (N) | Pendientes (N) | Confirmados (N)
- Resumen mensual colapsable con total visible
- CSV export con toast

### Catálogo (sub-tabs: Productos | Categorías)
- Productos: filtrar por categoría (sin "Todos"), buscar, toggle activo, editar nombre/precio/desc/cat, galería 3 fotos, drag reorder
- Categorías: editar nombre/emoji/subtítulo, crear custom, drag reorder (orden se refleja en catálogo público)

### Sitio (sub-tabs: Textos | Logo & Media | Destacados | Config)
- Textos: homepage content + site texts (carrito, checkout)
- Logo & Media: upload logo + Instagram Reels URLs
- Destacados: checkboxes para 6 featured products
- Config: áreas de transporte + testimonios

## Catálogo público
- CategoryFilter: grid uniforme de 9 cards con doodles SVG, orden dinámico
- ProductCard compacta: aspect-[4/3], nombre 2 líneas, precio + botón "+" circular naranja
- Productos $0: "Consultar" abre WhatsApp directo (no agrega al carrito)
- ProductModal: carrusel de hasta 3 fotos con flechas + dots + keyboard nav
- Grid: 2-col móvil, 3-col tablet, 4-col desktop, gap-2

## Checkout
- Persistencia en sessionStorage
- Validación: nombre requerido, teléfono min 7 dígitos max 12, email opcional
- Tiempo: selector hora/minuto (:00/:15/:30/:45) + AM/PM
- Transporte: auto-calculado por área, "Otra área" = por confirmar
- Confirmación window.confirm antes de enviar
- WhatsApp: window.location.href (sin popup blocker en iOS)
- PDF generado y subido a Supabase Storage

## CMS (textos editables desde admin)
- Definidos en src/lib/site-texts.ts con defaults
- Keys: cart_title, cart_urgency, cart_transport_message, cart_cta_add_more, cart_cta_checkout, cart_empty_title, cart_empty_subtitle, cart_clear_label, checkout_title, checkout_submit, checkout_loading, catalog_cta, whatsapp_fallback
- Se cachean client-side, se limpian con clearSiteTextsCache()

## UX
- Target: mamás panameñas 30-45 años. Mobile-first (375px)
- Contraste: mínimo gray-500 sobre blanco
- Touch targets: mínimo 44px
- Skeleton loading en carga de datos
- Toast notifications (bottom-4 en móvil, bottom-24 en desktop)
- Confetti animado respeta prefers-reduced-motion
- formatCurrency usa Intl.NumberFormat

## API Routes
| Ruta | Métodos | Descripción |
|------|---------|-------------|
| `/api/auth` | GET, POST | Login con PIN, validación de sesión |
| `/api/orders` | GET, POST, PATCH, DELETE | CRUD de pedidos (items, deposits, discount, transport, status) |
| `/api/upload` | POST | Subir imágenes con imageIndex (0/1/2) para galería |
| `/api/revalidate` | POST | On-demand revalidation (requiere admin token) |

## Deploy
```bash
git push origin main   # Auto-deploy via Vercel
```

## Env vars necesarias en Vercel
- `ADMIN_PIN` — PIN del admin
- `SUPABASE_SERVICE_ROLE_KEY` — service role key
- `NEXT_PUBLIC_SUPABASE_URL` — URL del proyecto
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key
- `NEXT_PUBLIC_GA_ID` — Google Analytics (opcional)
