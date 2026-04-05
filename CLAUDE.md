# PlayTime — Catálogo de Artículos para Fiestas

Catálogo online para negocio de fiestas/cumpleaños en Panamá. El cliente ve productos, arma su paquete y hace pedido por WhatsApp.

## Stack
- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **Styling:** Tailwind CSS
- **PDF:** jsPDF (resumen de pedido)

## Módulos
| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Landing | `/` | Hero, servicios, productos destacados, testimonios, Instagram. ISR cada 60s |
| Catálogo | `/catalogo` | Dos modos: planes completos / armar paquete. Búsqueda + filtros. Client-side fetch |
| Carrito | `/carrito` | Persistencia en localStorage |
| Checkout | `/checkout` | 4 pasos: datos → evento → pago → resumen. WhatsApp al final |
| Admin | `/admin` | PIN protegido. Gestión de pedidos, productos, categorías, sitio web |

## Auth
- Admin: PIN validado en `/api/auth` con rate limiting (5 intentos / 15 min)
- Sesión: token en memoria (24h), comparación constant-time
- RLS: anon puede leer, solo authenticated/service_role puede escribir
- Env var: `ADMIN_PIN`, `SUPABASE_SERVICE_ROLE_KEY`

## Base de datos
- Schema en `supabase-migration.sql`
- Tablas: pt_products, pt_settings, pt_orders, pt_order_items
- Storage bucket: `playtime-images` para fotos de productos

## Branding
- Brandbook en `brandbook.pdf`
- Colores: purple (#580459), teal (#84D9D0), orange (#F27405), pink (#F27289), yellow (#F2C84B), cream (#FAF3E8)
- Fuente única: Chalet-LondonNineteenEighty (local, en src/app/fonts/)
- Doodles SVG custom por categoría

## Caching y Revalidación
- Homepage (`/`): ISR con `revalidate = 60` (se regenera cada 60 segundos)
- On-demand revalidation: `/api/revalidate` — se llama automáticamente al guardar en admin
- Catálogo/productos: client-side fetch, cambios se ven al instante
- Al guardar en admin → datos a Supabase + revalidación del sitio (sin necesidad de push)

## Admin (`/admin`)
- 4 tabs: Pedidos, Sitio Web, Categorías, Productos
- Feedback via ToastContext global (toast fijo abajo de la pantalla)
- Loading states en todos los botones de guardar
- Sitio Web: 6 sub-secciones (Homepage, Logo, Destacados, Áreas, Reels, Testimonios)
- Cada guardado en Sitio Web dispara revalidación on-demand

## UX
- Usuarios: clientes del negocio (mamás panameñas). Mobile-first.
- Flujo: ver catálogo → agregar al carrito → checkout → confirmar por WhatsApp
- Paginación: 12 productos por página con "Ver más"
- Búsqueda con debounce 300ms
- Surcharge 5% en tarjeta de crédito (constante CREDIT_CARD_SURCHARGE)
- Transporte configurable por área

## API Routes
| Ruta | Métodos | Descripción |
|------|---------|-------------|
| `/api/auth` | GET, POST | Login con PIN, validación de sesión |
| `/api/orders` | GET, POST, PATCH, DELETE | CRUD de pedidos |
| `/api/upload` | POST | Subir imágenes a Supabase Storage |
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
