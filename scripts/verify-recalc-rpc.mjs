/**
 * verify-recalc-rpc.mjs — paridad recalc JS vs SQL.
 *
 * Compara, sobre TODOS los pedidos existentes, el resultado del helper JS
 * `recalcTotals` (src/app/api/orders/route.ts) contra el RPC SQL
 * `compute_order_totals` (read-only, no muta nada) del gate
 * 2026-06-06_orders_rpcs.sql. Debe dar 0 divergencias ANTES de cortar el
 * código del ítem 4 a usar el RPC.
 *
 * Requiere el gate aplicado (la función compute_order_totals debe existir) y la
 * SERVICE ROLE key (los RPCs son service_role-only).
 *
 * Uso:
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
 *   node scripts/verify-recalc-rpc.mjs
 *
 *   ... node scripts/verify-recalc-rpc.mjs --verbose   # imprime cada pedido
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VERBOSE = process.argv.includes('--verbose');

if (!URL || !KEY) {
  console.error('Falta SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const sb = createClient(URL, KEY);

// ── Réplica EXACTA de recalcTotals() de src/app/api/orders/route.ts ──
const round2 = (n) => Math.round(n * 100) / 100;
function recalcJS(items, o) {
  const itemsTotal = round2(items.reduce((s, i) => s + (Number(i.line_total) || 0), 0));
  const discRaw = Math.max(0, Number(o.discount) || 0);
  const disc = o.discount_type === 'percent' ? round2(itemsTotal * discRaw / 100) : discRaw;
  const subtotalAfterDiscount = Math.max(0, itemsTotal - disc);
  const transportVal = Math.max(0, Number(o.transport_cost_confirmed) || 0);
  const base = subtotalAfterDiscount + transportVal;
  const surcharge = o.payment_method === 'credit_card' ? round2(base * 0.05) : 0;
  const total = round2(base + surcharge);
  return { subtotal: itemsTotal, surcharge, total };
}

async function fetchAll(table, cols) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

const cents = (n) => Math.round((Number(n) || 0) * 100);
const eq = (a, b) => cents(a) === cents(b);

async function main() {
  console.log('Cargando pedidos e items…');
  const orders = await fetchAll('pt_orders', 'id, discount, discount_type, transport_cost_confirmed, payment_method');
  const items = await fetchAll('pt_order_items', 'order_id, line_total');
  const itemsByOrder = new Map();
  for (const it of items) {
    if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
    itemsByOrder.get(it.order_id).push(it);
  }
  console.log(`${orders.length} pedidos, ${items.length} items. Comparando JS vs SQL…\n`);

  let checked = 0;
  const mismatches = [];
  // Lotes para no saturar con N rpc en paralelo.
  const CHUNK = 25;
  for (let i = 0; i < orders.length; i += CHUNK) {
    const batch = orders.slice(i, i + CHUNK);
    await Promise.all(batch.map(async (o) => {
      const js = recalcJS(itemsByOrder.get(o.id) || [], o);
      const { data: sql, error } = await sb.rpc('compute_order_totals', { p_order_id: o.id });
      if (error) { mismatches.push({ id: o.id, error: error.message }); return; }
      checked++;
      const same = eq(js.subtotal, sql.subtotal) && eq(js.surcharge, sql.surcharge) && eq(js.total, sql.total);
      if (VERBOSE) console.log(`#${o.id}  JS{${js.subtotal},${js.surcharge},${js.total}}  SQL{${sql.subtotal},${sql.surcharge},${sql.total}}  ${same ? 'OK' : 'DIVERGE'}`);
      if (!same) mismatches.push({ id: o.id, js, sql });
    }));
    process.stdout.write(`\r  comparados ${Math.min(i + CHUNK, orders.length)}/${orders.length}`);
  }
  console.log('\n');

  if (mismatches.length === 0) {
    console.log(`✅ PARIDAD OK — ${checked}/${orders.length} pedidos: JS y SQL dan el MISMO subtotal/surcharge/total.`);
    console.log('Seguro cortar el código del ítem 4 al RPC.');
  } else {
    console.log(`❌ ${mismatches.length} DIVERGENCIA(S) — NO mergear el código del ítem 4. Revisar el SQL:`);
    for (const m of mismatches.slice(0, 30)) {
      if (m.error) console.log(`  #${m.id}: error rpc ${m.error}`);
      else console.log(`  #${m.id}: JS ${JSON.stringify(m.js)}  vs  SQL ${JSON.stringify(m.sql)}`);
    }
    if (mismatches.length > 30) console.log(`  …y ${mismatches.length - 30} más`);
    process.exit(2);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
