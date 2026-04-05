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
| Landing | `/` | Hero, servicios, productos destacados, testimonios, Instagram |
| Catálogo | `/catalogo` | Dos modos: planes completos / armar paquete. Búsqueda + filtros |
| Carrito | `/carrito` | Persistencia en localStorage |
| Checkout | `/checkout` | 4 pasos: datos → evento → pago → resumen. WhatsApp al final |
| Admin | `/admin` | PIN protegido. Gestión de pedidos, productos, config |

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
- Fuentes: Nunito (body) + Pacifico (script/decorativo)
- Doodles SVG custom por categoría

## UX
- Usuarios: clientes del negocio (mamás panameñas). Mobile-first.
- Flujo: ver catálogo → agregar al carrito → checkout → confirmar por WhatsApp
- Paginación: 12 productos por página con "Ver más"
- Búsqueda con debounce 300ms
- Surcharge 5% en tarjeta de crédito (constante CREDIT_CARD_SURCHARGE)
- Transporte configurable por área

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
