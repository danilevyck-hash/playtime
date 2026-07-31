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

// Abrir un pedido QUE YA ESTÉ A LA VISTA, con un click de mouse por coordenada.
//
// 🩸 NO se puede usar `locator.click()` acá, y esto costó un diagnóstico falso:
// Playwright desplaza el elemento a la vista antes de clickearlo. Al apuntarle a
// la PRIMERA tarjeta —que a 1.500 px quedó muy por encima— el navegador subía la
// página a 64 px ANTES del click, y el listado guardaba 64 en vez de 1.500. La
// medición se saboteaba sola: el código guardaba bien lo que veía, pero para
// entonces ya no era la posición que el test creía estar probando.
//
// Un usuario real toca una tarjeta que YA está en pantalla; no hay auto-scroll.
// Se reproduce eso: se busca una tarjeta dentro del viewport y se clickea por
// coordenada, que no mueve nada.
const punto = await page.evaluate(() => {
  // La tarjeta del listado es un <button> (OrdersTab.tsx: onClick={() => goToOrder(o.id)}).
  const candidatos = [...document.querySelectorAll('button')]
    .filter((el) => /Cliente de Prueba/.test(el.textContent ?? ''));
  for (const el of candidatos) {
    const r = el.getBoundingClientRect();
    // Bien adentro del viewport, para no pegarle a una barra pegajosa.
    if (r.top > 120 && r.bottom < window.innerHeight - 60 && r.width > 100) {
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    }
  }
  return null;
});
if (!punto) {
  console.error('❌ no encontré una tarjeta a la vista para clickear; la prueba no sería concluyente');
  await navegador.close();
  process.exit(1);
}
await page.mouse.click(punto.x, punto.y);
const alClickear = await page.evaluate(() => window.scrollY);
if (Math.abs(alClickear - antes) > 5) {
  console.error(`❌ el click movió el scroll (${antes} → ${alClickear}); se estaría midiendo otra posición`);
  await navegador.close();
  process.exit(1);
}
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

// ─── GUARDAS: cuándo NO tiene que reponer ────────────────────────────────────
//
// Reponer de más es peor que no reponer: un salto que el usuario no pidió. Los
// tres casos que Daniel puso como límite se prueban acá, y cada uno se prueba
// con la posición YA guardada en sessionStorage — si no, "no saltó" no probaría
// nada: no habría nada que reponer.

const guardas = [];

/** Abre /admin en una pestaña limpia con lo que se le siembre y mide el scroll. */
async function montarListado({ sembrar, tocarScroll }) {
  const c = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await c.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await c.addInitScript(sembrar);
  await c.route(/\/api\/orders/, async (route) => {
    const url = route.request().url();
    await new Promise((r) => setTimeout(r, LATENCIA_MS));
    if (/\/api\/orders\/stats/.test(url)) return route.fulfill(json(stats));
    return route.fulfill(json({ orders: pedidos, total: N_PEDIDOS, hasMore: false }));
  });
  const pg = await c.newPage();
  await pg.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  if (tocarScroll) {
    // El usuario se mueve ANTES de que llegue la altura: la reposición tiene
    // que abandonar y no pelearle el scroll.
    await pg.waitForTimeout(80);
    await pg.mouse.wheel(0, 200);
  }
  await pg.waitForTimeout(LATENCIA_MS + 2500);
  const y = await pg.evaluate(() => window.scrollY);
  await c.close();
  return y;
}

// (A) Entrada normal al listado, con posición guardada pero SIN vuelta.
{
  const y = await montarListado({ sembrar: () => {
    sessionStorage.setItem('adminToken', 'token-de-prueba');
    sessionStorage.setItem('adminRole', 'admin');
    sessionStorage.setItem('adminScroll:/admin', '1500');
  }});
  guardas.push({ caso: 'entrada normal a /admin (sin volver de un detalle)', y, ok: y === 0 });
}

// (B) Recién autenticado con el PIN. Es el caso que más importa: el listado
//     aparece por primera vez y NO debe saltar.
{
  const y = await montarListado({ sembrar: () => {
    // Sin token: se pinta el PIN. Se simula el login guardando la sesión y
    // recargando el estado como hace admin/page.tsx al montar.
    sessionStorage.setItem('adminScroll:/admin', '1500');
    setTimeout(() => {
      sessionStorage.setItem('adminToken', 'token-de-prueba');
      sessionStorage.setItem('adminRole', 'admin');
    }, 0);
  }});
  guardas.push({ caso: 'listado montado justo después del PIN', y, ok: y === 0 });
}

// (C) Vuelta legítima, pero el usuario ya movió el scroll con el dedo.
{
  const y = await montarListado({
    sembrar: () => {
      sessionStorage.setItem('adminToken', 'token-de-prueba');
      sessionStorage.setItem('adminRole', 'admin');
      sessionStorage.setItem('adminScroll:/admin', '1500');
      sessionStorage.setItem('adminOrdersBack', '1');
    },
    tocarScroll: true,
  });
  // No se le pelea: tiene que quedar donde lo dejó el usuario, no en 1500.
  guardas.push({ caso: 'el usuario ya scrolleó: se abandona la reposición', y, ok: Math.abs(y - 1500) > 150 });
}

console.error('');
console.error('GUARDAS — cuándo NO debe reponer');
let guardasOk = true;
for (const g of guardas) {
  if (!g.ok) guardasOk = false;
  console.error(`  ${g.ok ? '✅' : '❌'} ${g.caso.padEnd(52)} scroll final ${g.y}px`);
}

await navegador.close();
process.exit(ok && guardasOk ? 0 : 1);
