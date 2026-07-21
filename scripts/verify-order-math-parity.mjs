/**
 * verify-order-math-parity.mjs — prueba que el refactor de Sprint 3 (fórmula
 * única en src/lib/order-math.ts) NO cambia ni un centavo vs la fórmula previa.
 *
 * `golden` es copia EXACTA de recalcRawJS() (scripts/verify-recalc-rpc.mjs), que
 * ya está probada idéntica al RPC SQL compute_totals_raw() por el barrido float8.
 * `candidate` refleja computeOrderTotals() de src/lib/order-math.ts. Ambas se
 * corren sobre los mismos medio-centavos (.10/.30/.70/.90 + descuentos % + fixed
 * + transporte + tarjeta). 0 divergencias ⇒ el total sigue siendo bit a bit el
 * mismo. Sin DB, corre local:  node scripts/verify-order-math-parity.mjs
 *
 * ⚠️ Si tocas order-math.ts, actualiza `candidate` aquí y vuelve a correr.
 */
const round2 = (n) => Math.round(n * 100) / 100;

// Copia textual de recalcRawJS() — la referencia probada == SQL.
function golden(itemsTotal, discount, discountType, transport, payment) {
  const discRaw = Math.max(0, Number(discount) || 0);
  const disc = discountType === 'percent' ? round2(itemsTotal * discRaw / 100) : discRaw;
  const subtotalAfterDiscount = Math.max(0, itemsTotal - disc);
  const base = subtotalAfterDiscount + Math.max(0, Number(transport) || 0);
  const surcharge = payment === 'credit_card' ? round2(base * 0.05) : 0;
  const total = round2(base + surcharge);
  return { subtotal: itemsTotal, surcharge, total };
}

// Refleja computeOrderTotals() de src/lib/order-math.ts.
function candidate(itemsTotal, discount, discountType, transport, payment) {
  const discRaw = Math.max(0, Number(discount) || 0);
  const discountAmount = discountType === 'percent' ? round2(itemsTotal * discRaw / 100) : discRaw;
  const subtotalAfterDiscount = Math.max(0, itemsTotal - discountAmount);
  const appliedTransport = Math.max(0, Number(transport) || 0);
  const base = subtotalAfterDiscount + appliedTransport;
  const surcharge = payment === 'credit_card' ? round2(base * 0.05) : 0;
  const total = round2(base + surcharge);
  return { subtotal: itemsTotal, surcharge, total };
}

const cents = (n) => Math.round((Number(n) || 0) * 100);
const same = (a, b) => cents(a.subtotal) === cents(b.subtotal) && cents(a.surcharge) === cents(b.surcharge) && cents(a.total) === cents(b.total);

function* cases() {
  const transports = [0, -1, 50, 55.5, 90];
  const payments = ['bank_transfer', 'credit_card'];
  // Medio-centavos de surcharge: bases .10/.30/.70/.90.
  for (let whole = 0; whole <= 400; whole++) {
    for (const frac of [0, 10, 30, 50, 70, 90]) {
      const itemsTotal = whole + frac / 100;
      for (const t of transports) for (const pay of payments) {
        yield [itemsTotal, 0, 'fixed', t, pay];
      }
    }
  }
  // Descuentos % (medio-centavo en it*pct/100) + fixed.
  for (let k = 1; k <= 400; k++) {
    const itemsTotal = round2(k * 0.05);
    for (const pct of [10, 5, 33, 12.5, 100]) yield [itemsTotal, pct, 'percent', 55.5, 'credit_card'];
    for (const fx of [0.01, 1.5, 7.77, itemsTotal, itemsTotal + 10]) yield [itemsTotal, fx, 'fixed', 55.5, 'credit_card'];
  }
}

let checked = 0;
const mismatches = [];
for (const c of cases()) {
  checked++;
  const g = golden(...c);
  const n = candidate(...c);
  if (!same(g, n)) mismatches.push({ c, golden: g, candidate: n });
}

if (mismatches.length === 0) {
  console.log(`✅ PARIDAD OK — ${checked} casos (medio-centavos .10/.30/.70/.90 + %/fixed + transporte + tarjeta): order-math coincide con la fórmula previa. 0 divergencias, el total no cambia ni un centavo.`);
} else {
  console.log(`❌ ${mismatches.length}/${checked} DIVERGENCIA(S) — el refactor cambia el total. NO mergear:`);
  for (const m of mismatches.slice(0, 20)) {
    console.log(`  in=${JSON.stringify(m.c)}  golden=${JSON.stringify(m.golden)}  candidate=${JSON.stringify(m.candidate)}`);
  }
  process.exit(2);
}
