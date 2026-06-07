/**
 * verify-recalc-rpc.mjs — paridad recalc JS vs SQL.
 *
 * Compara el resultado del helper JS `recalcTotals` (src/app/api/orders/route.ts)
 * contra los RPCs SQL del gate 2026-06-06_orders_rpcs.sql:
 *   1) PEDIDOS REALES → compute_order_totals(order_id)  (read-only, no muta).
 *   2) INPUTS SINTÉTICOS → compute_totals_raw(...)  con bases terminadas en
 *      .10/.30/.70/.90 + credit_card + descuentos % — exactamente los medio-centavos
 *      donde round(numeric,2) divergía de Math.round (el bug que motivó la rev 2).
 * Debe dar 0 divergencias ANTES de cortar el código del ítem 4 al RPC.
 *
 * Requiere el gate aplicado y la SERVICE ROLE key (los RPCs son service_role-only).
 *
 * Uso:
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
 *   node scripts/verify-recalc-rpc.mjs          # [--verbose] imprime cada caso
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
function recalcRawJS(itemsTotal, discount, discountType, transport, payment) {
  const discRaw = Math.max(0, Number(discount) || 0);
  const disc = discountType === 'percent' ? round2(itemsTotal * discRaw / 100) : discRaw;
  const subtotalAfterDiscount = Math.max(0, itemsTotal - disc);
  const base = subtotalAfterDiscount + Math.max(0, Number(transport) || 0);
  const surcharge = payment === 'credit_card' ? round2(base * 0.05) : 0;
  const total = round2(base + surcharge);
  return { subtotal: itemsTotal, surcharge, total };
}
function recalcOrderJS(items, o) {
  const itemsTotal = round2(items.reduce((s, i) => s + (Number(i.line_total) || 0), 0));
  return recalcRawJS(itemsTotal, o.discount, o.discount_type, o.transport_cost_confirmed, o.payment_method);
}

const cents = (n) => Math.round((Number(n) || 0) * 100);
const same = (js, sql) => cents(js.subtotal) === cents(sql.subtotal) && cents(js.surcharge) === cents(sql.surcharge) && cents(js.total) === cents(sql.total);

async function fetchAll(table, cols) {
  const PAGE = 1000, out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function runBatched(cases, rpcName, argsOf, jsOf, label) {
  let checked = 0; const mismatches = [];
  const CHUNK = 25;
  for (let i = 0; i < cases.length; i += CHUNK) {
    const batch = cases.slice(i, i + CHUNK);
    await Promise.all(batch.map(async (c) => {
      const { data: sql, error } = await sb.rpc(rpcName, argsOf(c));
      if (error) { mismatches.push({ c, error: error.message }); return; }
      checked++;
      const js = jsOf(c);
      if (VERBOSE) console.log(`${label} ${JSON.stringify(argsOf(c))} → JS{${js.subtotal},${js.surcharge},${js.total}} SQL{${sql.subtotal},${sql.surcharge},${sql.total}} ${same(js, sql) ? 'OK' : 'DIVERGE'}`);
      if (!same(js, sql)) mismatches.push({ c, js, sql });
    }));
    process.stdout.write(`\r  ${label}: ${Math.min(i + CHUNK, cases.length)}/${cases.length}`);
  }
  process.stdout.write('\n');
  return { checked, mismatches };
}

function syntheticCases() {
  const cases = [];
  // Surcharge: bases terminando en .10/.30/.70/.90 + credit_card (medio-centavo en base*0.05).
  for (let whole = 0; whole <= 300; whole++) {
    for (const frac of [10, 30, 70, 90]) {
      cases.push({ itemsTotal: whole + frac / 100, discount: 0, discountType: 'fixed', transport: 0, payment: 'credit_card' });
    }
  }
  // Descuento %: it*pct/100 con medio-centavo (ej it=1.45 pct=10 → 0.145).
  for (let k = 1; k <= 400; k++) {
    const itemsTotal = round2(k * 0.05); // 0.05 .. 20.00
    for (const pct of [10, 5, 33, 12.5]) {
      cases.push({ itemsTotal, discount: pct, discountType: 'percent', transport: 0, payment: 'credit_card' });
    }
  }
  return cases;
}

async function main() {
  console.log('Cargando pedidos e items…');
  const orders = await fetchAll('pt_orders', 'id, discount, discount_type, transport_cost_confirmed, payment_method');
  const items = await fetchAll('pt_order_items', 'order_id, line_total');
  const byOrder = new Map();
  for (const it of items) { (byOrder.get(it.order_id) || byOrder.set(it.order_id, []).get(it.order_id)).push(it); }
  console.log(`${orders.length} pedidos reales, ${items.length} items.\n`);

  const real = await runBatched(
    orders, 'compute_order_totals',
    (o) => ({ p_order_id: o.id }),
    (o) => recalcOrderJS(byOrder.get(o.id) || [], o),
    'reales'
  );

  const syn = syntheticCases();
  console.log(`\n${syn.length} casos sintéticos (.10/.30/.70/.90 + tarjeta + %)…`);
  const synth = await runBatched(
    syn, 'compute_totals_raw',
    (c) => ({ p_items_total: c.itemsTotal, p_discount: c.discount, p_discount_type: c.discountType, p_transport: c.transport, p_payment: c.payment }),
    (c) => recalcRawJS(c.itemsTotal, c.discount, c.discountType, c.transport, c.payment),
    'sintéticos'
  );

  const all = [...real.mismatches, ...synth.mismatches];
  console.log('');
  if (all.length === 0) {
    console.log(`✅ PARIDAD OK — reales ${real.checked}/${orders.length} + sintéticos ${synth.checked}/${syn.length}: JS y SQL coinciden.`);
    console.log('Seguro cortar el código del ítem 4 al RPC.');
  } else {
    console.log(`❌ ${all.length} DIVERGENCIA(S) — NO mergear. Revisar el SQL:`);
    for (const m of all.slice(0, 30)) {
      if (m.error) console.log(`  ${JSON.stringify(m.c)}: error rpc ${m.error}`);
      else console.log(`  ${JSON.stringify(m.c)}: JS ${JSON.stringify(m.js)} vs SQL ${JSON.stringify(m.sql)}`);
    }
    if (all.length > 30) console.log(`  …y ${all.length - 30} más`);
    process.exit(2);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
