# PlayTime — Catálogo de Experiencias para Fiestas

Catálogo online para negocio de fiestas/cumpleaños en Panamá. El cliente elige categoría, selecciona productos, arma su paquete y hace pedido por WhatsApp. PWA instalable desde iPhone/Android.

## Stack
- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **Styling:** Tailwind CSS (dark mode automático por `prefers-color-scheme`)
- **PDF:** jsPDF + jspdf-autotable (factura con descuento, transporte, depósitos, brand colors)

## Categorías (9)
planes (Experiences), spa (Spa Experience), show (Show & Personajes), snacks (Snack Bar), softplay (Soft Play), bounces (Bounces), ballpit (Ball Pit & Slides), addons (Add-Ons), creative (Creative Studio)

El orden de categorías es configurable desde admin (drag-and-drop) y se guarda en pt_settings key `category_order`. Se pueden crear categorías custom desde admin y eliminarlas.

## Módulos
| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Landing | `/` | Hero con confetti + CTA único, servicios, destacados, testimonios, Instagram |
| Catálogo | `/catalogo` | Chips horizontales con scroll snap, auto-selecciona primera categoría, infinite scroll, búsqueda siempre visible, sticky bar |
| Carrito | `/carrito` | Items como cards, variantes visibles como chip, sticky CTA en móvil, favoritos con corazón |
| Checkout | `/checkout` | 3 pasos: datos → evento → confirmar (pago integrado en resumen). Slide-in entre pasos |
| Confirmación | `/checkout/confirmacion` | Auto-abre WhatsApp, resumen colapsable del pedido, botón agregar al calendario (.ics), datos bancarios |
| Admin | `/admin` | PIN protegido. 3 tabs: Pedidos, Catálogo, Sitio |

## Sistema de Variantes
- `ProductVariant { id, label, price? }` en `src/lib/types.ts`
- Productos con variantes: Roller Coaster, Mini Parque, Cerca, Pads de Piso, Lego Foam (color), Piscina de Bolas (5 modelos con precios), Túnel (3 tamaños con precios)
- Modal: chips horizontales para seleccionar variante. Si tiene precio propio, actualiza precio mostrado
- Cart ID incluye variante: `product-id--variant-id` (items separados en carrito)
- Nombre en carrito: "Túnel — Grande · 2.15m"
- Botón deshabilitado si no hay variante seleccionada

## Auth
- Admin: PIN validado en `/api/auth` con rate limiting (5 intentos / 15 min)
- Sesión: token en memoria (24h), comparación constant-time
- RLS: anon puede leer, solo authenticated/service_role puede escribir
- Env var: `ADMIN_PIN`, `SUPABASE_SERVICE_ROLE_KEY`

## Base de datos
- Schema en `supabase-migration.sql` y `supabase-migration-v2.sql`
- Tablas: pt_product_overrides, pt_custom_products, pt_settings, pt_orders, pt_order_items
- Columnas extras en pt_orders: deposits (JSONB), discount (NUMERIC), transport_cost_confirmed (NUMERIC)
- Storage bucket: `playtime-images` para fotos de productos y PDFs

## Branding
- Colores: purple (#580459), teal (#84D9D0), orange (#F27405), pink (#F27289), yellow (#F2C84B), cream (#FAF3E8)
- Dark mode: automático por media query, overrides globales en CSS (brand colors se mantienen)
- Fuente única: Chalet-LondonNineteenEighty (local, en src/app/fonts/)
- Doodles SVG custom por categoría (src/components/ui/CategoryDoodles.tsx)
- Confetti animado en Hero (CSS keyframes float-a/b/c, 5 blobs en móvil)

## Admin (`/admin`)
- 3 tabs: Pedidos, Catálogo (Productos + Categorías), Sitio
- Tab bar estilo iOS segmented control
- Skeleton shimmer al cargar (Apple-style)

### Pedidos
- Pipeline: Pendiente → Confirmado → Realizado → Rechazado
- Acciones: WhatsApp, Editar, PDF en barra neutral. Eliminar en menú overflow (···)
- Factura unificada: items + descuento inline + transporte inline + surcharge + total + método de pago
- Descuento y transporte editables directamente en la factura (no en sección separada)
- Transporte auto-sugerido por área, auto-resuelve en PDF sin necesidad de confirmar
- Totales recalculados server-side al cambiar descuento, transporte o items
- Cálculo correcto: descuento se aplica ANTES del surcharge
- Depósitos en sección propia con barra de progreso visual
- Saldo pendiente calculado en vivo (no desde order.total de BD)
- Edit form agrupado: secciones "Cliente" y "Evento" con headers
- Hora con selector AM/PM (3 dropdowns: hora, :00/:30, AM/PM)
- Validación de teléfono visual (borde rojo si < 7 dígitos)
- Badges en card colapsado: 💰 depósito, 🏷️ descuento, 🚚? transporte pendiente
- Filtros: Todos | Pendientes | Confirmados | Rechazados (con conteos)
- PDF incluye depósitos y saldo pendiente
- CSV export con toast
- Resumen mensual colapsable

### Catálogo (sub-tabs: Productos | Categorías)
- Productos: filtrar por categoría, buscar, toggle activo, editar nombre/precio/desc/cat, galería 3 fotos, drag reorder
- Categorías: editar nombre/emoji/subtítulo, crear custom, eliminar custom, drag reorder

### Sitio (sub-tabs: Textos | Logo & Media | Destacados | Config)
- Textos: homepage content + site texts (carrito, checkout)
- Logo & Media: upload logo + Instagram Reels URLs
- Destacados: checkboxes para 6 featured products
- Config: áreas de transporte + testimonios

## Catálogo público
- CategoryFilter: chips horizontales con scroll snap, orden dinámico
- Auto-selecciona primera categoría al cargar (no pantalla vacía)
- Búsqueda siempre visible en barra sticky debajo del navbar
- Infinite scroll (IntersectionObserver, 12 productos por batch)
- Skeleton shimmer mientras cargan productos
- ProductCard: aspect-[4/3], hover shadow-lg, active:scale-[0.98], fade-in escalonado
- Favoritos: corazón en top-left de cada card (localStorage)
- Productos $0: "Consultar" abre WhatsApp directo
- ProductModal: bottom sheet en móvil (drag-to-dismiss), centrado en desktop
- Modal: 16:9 aspect ratio, sticky price+button en footer, sin imagen si no tiene
- Variantes como chips: seleccionado=purple, no seleccionado=gray
- Grid: 2-col móvil, 3-col tablet, 4-col desktop, gap-2

## Checkout
- 3 pasos (era 4): Datos → Evento → Confirmar (pago integrado como toggle)
- Persistencia en sessionStorage (valida fechas no pasadas al recargar)
- Mini resumen flotante en pasos 0-1 ("3 artículos · $410")
- Slide-in animado entre pasos
- Validación: nombre requerido, teléfono min 7 dígitos, email opcional (regex permisiva)
- Tiempo: selector hora/minuto (:00/:30) + AM/PM. Horarios inteligentes: AM 8-12, PM 1-8
- Auto-detect área al escribir dirección (Costa del Este, Bella Vista, etc.)
- Sección cumpleañero siempre visible (no colapsable)
- Método de pago: toggle inline en el resumen (Transferencia | Tarjeta +5%)
- Confirm dialog con desglose itemizado antes de enviar
- Anti doble-submit (useRef)
- Loading steps: "Guardando pedido...", "Generando factura...", "Subiendo PDF..."
- Navega a confirmación primero, WhatsApp se auto-abre con delay 1.2s
- Order summary guardado en sessionStorage para confirmación

## Confirmación
- Auto-abre WhatsApp con delay 1.2s
- Resumen colapsable del pedido (items, fecha, total desde sessionStorage)
- Botón "Agregar al calendario" genera y descarga .ics
- Datos bancarios con botón copiar
- Botón WhatsApp como backup
- Confetti de fondo

## PDF Factura
- Generado con jsPDF + jspdf-autotable
- Header purple con logo (validado: res.ok, max 2MB)
- Badge naranja con # pedido
- Sección cliente con text wrapping (splitTextToSize)
- Sección evento con fecha UTC-safe (parse directo, no Date)
- Hora en formato 12h AM/PM
- Tabla de productos con transporte como línea
- Transporte auto-resuelto por área (no "Por confirmar" si área conocida)
- Total box: subtotal, descuento, transporte, recargo, total
- Sección depósitos con pagos recibidos y saldo pendiente
- Datos bancarios si transferencia
- Footer con contacto y dots decorativos
- Rounding con round2() para evitar floating-point

## Carrito
- Items como cards separadas (bg-white rounded-xl, space-y-2)
- Variante visible como chip gris debajo del nombre
- Sticky CTA "Proceder al pago" fixed en móvil (con pb-safe para iPhone)
- "Limpiar carrito" al final, menos prominente
- CartSummary muestra conteo de artículos
- Haptic feedback (vibrate 10ms) + pop sound sutil al agregar

## CMS (textos editables desde admin)
- Definidos en src/lib/site-texts.ts con defaults
- Keys: cart_title, cart_urgency, cart_transport_message, cart_cta_add_more, cart_cta_checkout, cart_empty_title, cart_empty_subtitle, cart_clear_label, checkout_title, checkout_submit, checkout_loading, catalog_cta, whatsapp_fallback
- Se cachean client-side, se limpian con clearSiteTextsCache()

## UX & iPhone
- Target: mamás panameñas 30-45 años. Mobile-first (375px)
- PWA: manifest.json, instalable desde Home Screen
- Dark mode: automático por prefers-color-scheme (CSS global overrides)
- Favoritos: corazón en productos, persiste en localStorage (src/lib/useFavorites.ts)
- Bottom sheet: modal de producto como sheet en móvil, drag-to-dismiss
- Scroll snap en chips de categoría
- Skeleton shimmer en carga de productos
- Badge bounce al agregar al carrito (animate-cart-bounce)
- Fade-in escalonado en cards (50ms × index)
- Pressed state: active:scale-[0.98] en cards
- Input con label flotante (sube al enfocar)
- EmptyState component reutilizable (src/components/ui/EmptyState.tsx)
- Navbar: título centrado en móvil (Catálogo, Carrito, Checkout)
- Footer: contacto + WhatsApp CTA + redes (sin nav links duplicados)
- -webkit-tap-highlight-color: transparent
- Safe area padding (env(safe-area-inset-bottom))
- font-size: 16px en inputs (previene zoom iOS)
- Confetti: 5 blobs en móvil (reducido para rendimiento)
- Toast notifications (bottom-4 en móvil, bottom-24 en desktop)
- formatCurrency usa Intl.NumberFormat en-US ($1,500.00)
- Fechas en español panameño (es-PA)

## API Routes
| Ruta | Métodos | Descripción |
|------|---------|-------------|
| `/api/auth` | GET, POST | Login con PIN, validación de sesión |
| `/api/orders` | GET, POST, PATCH, DELETE | CRUD pedidos. POST recalcula totales server-side. PATCH valida ownership de items. GET con paginación (?limit, ?offset) |
| `/api/upload` | POST | Subir imágenes con imageIndex (0/1/2) para galería |
| `/api/revalidate` | POST | On-demand revalidation (requiere admin token) |

### Seguridad API
- Totales recalculados server-side (no confiamos en client)
- Items validados: nombre, cantidad 1-999, precio >= 0
- Ownership check: editItems/removeItem filtran por order_id
- Transport/discount validados >= 0
- Manual items validados: nombre max 200, precio max 99999
- Status validado contra lista permitida
- Phone validado 7-15 dígitos
- round2() en todos los cálculos para evitar floating-point

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
