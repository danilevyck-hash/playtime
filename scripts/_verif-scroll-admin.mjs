// GATE 2 — ¿"← Pedidos" conserva la posición del listado?
//
// 🩸 POR QUÉ ESTE SCRIPT Y NO "se ve bien". El listado se monta VACÍO
// (OrdersTab.tsx: orders arranca en []) y /admin arranca sin autenticar
// (admin/page.tsx: authenticated=false), así que en el instante en que el
// navegador intenta restaurar el scroll la página puede no tener altura y el
// restore se recorta a 0. Un router.back() puede "no alcanzar". Eso no se ve
// mirando: se mide.
//
// QUÉ SE MOCKEA Y QUÉ NO. Solo la RED (/api/orders, /api/orders/stats,
// /api/orders/:id). El resto — montaje, hidratación, alturas, historial y la
// restauración de scroll del navegador — es el código real. Es justo lo que hay
// que probar. Las claves de Supabase no están en local, y además así se puede
// forzar el peor caso: una respuesta LENTA (LATENCIA_MS), que es cuando el
// listado tarda más en tener altura.
//
//   node scripts/_verif-scroll-admin.mjs
//   LATENCIA_MS=800 node scripts/_verif-scroll-admin.mjs
//
// Playwright no está instalado en playtime; se toma del otro proyecto.

import { chromium } from '/Users/daniellevy/Code/fashion-group/cxc/node_modules/playwright/index.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3210';
const LATENCIA_MS = Number(process.env.LATENCIA_MS ?? 250);
const N_PEDIDOS = 40;
const SCROLL_OBJETIVO = 1500;

const pedidos = Array.from({ length: N_PEDIDOS }, (_, i) => ({
  id: i + 1,
  order_number: 1000 + i,
  customer_name: `Cliente de Prueba ${i + 1}`,
  customer_phone: '60000000',
  customer_email: null,
  event_date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
  event_time: '14:00',
  event_area: 'Costa del Este',
  event_address: 'Dirección de prueba 123',
  birthday_child_name: 'Nombre',
  birthday_child_age: 5,
  payment_method: i % 2 ? 'credit_card' : 'bank_transfer',
  subtotal: 100 + i,
  surcharge: 0,
  total: 100 + i,
  notes: null,
  internal_note: null,
  status: ['pendiente', 'confirmado', 'realizado', 'rechazado'][i % 4],
  deposit_amount: 0,
  deposits: [],
  discount: 0,
  discount_type: 'fixed',
  transport_cost_confirmed: 0,
  created_at: '2026-07-01T12:00:00Z',
  deleted_at: null,
  confirmed: false,
  items: [{ id: i + 1, product_name: 'Producto', quantity: 1, unit_price: 100 + i, line_total: 100 + i }],
}));

const stats = {
  total: N_PEDIDOS,
  counts: { pendiente: 10, confirmado: 10, realizado: 10, rechazado: 10 },
  confirmedRevenue: 1234,
  archived: 0,
  months: [{ key: '2026-08', label: 'Agosto 2026' }],
};

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const navegador = await chromium.launch();
const ctx = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
});

// El admin lee el token de sessionStorage; sin sembrarlo se pinta el PIN.
await ctx.addInitScript(() => {
  sessionStorage.setItem('adminToken', 'token-de-prueba');
  sessionStorage.setItem('adminRole', 'admin');
});
// El service worker de la PWA interfiere con la navegación medida.
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });

// Un solo handler por RegExp: los patrones glob de Playwright no distinguen
// bien /api/orders?query de /api/orders/:id, y una ruta que no engancha se ve
// igual que un listado vacío.
await ctx.route(/\/api\/orders/, async (route) => {
  const url = route.request().url();
  await new Promise((r) => setTimeout(r, LATENCIA_MS));
  if (/\/api\/orders\/stats/.test(url)) return route.fulfill(json(stats));
  const m = /\/api\/orders\/(\d+)/.exec(url);
  if (m) return route.fulfill(json({ order: pedidos[Number(m[1]) - 1] }));
  return route.fulfill(json({ orders: pedidos, total: N_PEDIDOS, hasMore: false }));
});

const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(String(e.message)));
if (process.env.DEBUG) page.on('request', (r) => { if (r.url().includes('/api/')) console.error('  →', r.method(), r.url().replace(BASE, '')); });

await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await page.waitForTimeout(LATENCIA_MS + 1200);

const hayPin = await page.locator('input[type="password"], input[inputmode="numeric"]').count();
const alturaListado = await page.evaluate(() => document.documentElement.scrollHeight);
console.error(`listado montado · alto ${alturaListado}px · campo PIN visible: ${hayPin > 0 ? 'SÍ (mal)' : 'no'}`);
if (alturaListado < SCROLL_OBJETIVO + 844) {
  console.error(`⚠️  el listado no da para scrollear hasta ${SCROLL_OBJETIVO}px; la prueba no sería concluyente`);
}

await page.evaluate((y) => window.scrollTo(0, y), SCROLL_OBJETIVO);
await page.waitForTimeout(400);
const antes = await page.evaluate(() => window.scrollY);
console.error(`scroll en el listado ANTES de entrar: ${antes}px`);

// Abrir el primer pedido visible (click en la card, no en un botón de acción).
const card = page.locator('[class*="cursor-pointer"], article, li').filter({ hasText: 'Cliente de Prueba' }).first();
const objetivo = (await card.count()) ? card : page.getByText(/Cliente de Prueba/).first();
await objetivo.click();
await page.waitForURL('**/admin/pedidos/**', { timeout: 10000 });
await page.waitForTimeout(LATENCIA_MS + 1200);
const urlDetalle = page.url();
console.error(`detalle abierto: ${urlDetalle.replace(BASE, '')}`);

// Volver con "← Pedidos".
await page.getByRole('button', { name: /Pedidos/ }).first().click();
await page.waitForURL((u) => !/\/admin\/pedidos\//.test(u.toString()), { timeout: 10000 });
// Margen generoso: el listado tiene que montar, autenticar, pedir y pintar.
await page.waitForTimeout(LATENCIA_MS + 2500);

const despues = await page.evaluate(() => window.scrollY);
const altoFinal = await page.evaluate(() => document.documentElement.scrollHeight);
console.error(`scroll en el listado DESPUÉS de volver: ${despues}px  (alto ${altoFinal}px)`);

await page.screenshot({ path: '/Users/daniellevy/.claude/jobs/5b66fe8c/tmp/playtime-scroll-vuelta.png', fullPage: false });

const tolerancia = 150;
const ok = Math.abs(despues - antes) <= tolerancia;
console.error('');
console.error(ok
  ? `✅ CONSERVA la posición (${antes} → ${despues}, dentro de ±${tolerancia}px)`
  : `❌ PIERDE la posición (${antes} → ${despues}, diferencia ${Math.abs(despues - antes)}px)`);
if (errores.length) console.error('errores JS:', errores.slice(0, 3));

await navegador.close();
process.exit(ok ? 0 : 1);
