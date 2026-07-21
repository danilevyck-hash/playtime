import { CREDIT_CARD_SURCHARGE } from './constants';
import type { PaymentMethod } from './types';

/**
 * Round to 2 decimals the SAME way everywhere: Math.round(n*100)/100 on IEEE-754
 * float64. This is the single definition — checkout, API, PDF and accounting all
 * import it so a half-cent never rounds one way in one place and the other way
 * elsewhere.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface OrderTotalsInput {
  /** Σ line totals, ALREADY round2'd (round2 of the sum of unitPrice*qty). */
  itemsTotal: number;
  /** Confirmed transport. <0 or "pending" is clamped to 0. */
  transport?: number;
  discount?: number;
  discountType?: 'fixed' | 'percent';
  paymentMethod: PaymentMethod;
}

export interface OrderTotals {
  /** Pre-discount items total (mirrors the RPC's returned `subtotal`). */
  subtotal: number;
  discountAmount: number;
  /** Transport actually applied (clamped to >= 0). */
  transport: number;
  surcharge: number;
  total: number;
}

/**
 * THE order totals formula. Byte-for-byte mirror of `compute_totals_raw()` in
 * supabase/migrations/2026-06-06_orders_rpcs.sql (float8 + js_round2) and of
 * `recalcRawJS()` in scripts/verify-recalc-rpc.mjs — both proven equal to the
 * DB by the float8 parity sweep. The stored order `total` comes from this exact
 * arithmetic, so any change here MUST keep parity (see verify-order-math-parity.mjs).
 *
 * Order of operations that matters for the cent: discount first, then transport,
 * then the card surcharge on that base, each round2'd like the RPC.
 */
export function computeOrderTotals({
  itemsTotal,
  transport = 0,
  discount = 0,
  discountType = 'fixed',
  paymentMethod,
}: OrderTotalsInput): OrderTotals {
  const discRaw = Math.max(0, Number(discount) || 0);
  const discountAmount = discountType === 'percent' ? round2(itemsTotal * discRaw / 100) : discRaw;
  const subtotalAfterDiscount = Math.max(0, itemsTotal - discountAmount);
  const appliedTransport = Math.max(0, Number(transport) || 0);
  const base = subtotalAfterDiscount + appliedTransport;
  const surcharge = paymentMethod === 'credit_card' ? round2(base * CREDIT_CARD_SURCHARGE) : 0;
  const total = round2(base + surcharge);
  return { subtotal: itemsTotal, discountAmount, transport: appliedTransport, surcharge, total };
}

/** round2(Σ unitPrice*quantity) — the canonical itemsTotal. */
export function computeItemsTotal(items: { unitPrice: number; quantity: number }[]): number {
  return round2(items.reduce((sum, i) => sum + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0), 0));
}
