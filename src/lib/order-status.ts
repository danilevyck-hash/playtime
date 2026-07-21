/**
 * Single source of truth for order status canonicalization.
 *
 * The DB has accumulated legacy status strings over time ('aprobada',
 * 'deposito', 'nuevo', 'rechazada') plus the boolean `confirmed`. This maps any
 * of them to the 4-state pipeline. Every place that reads a status MUST go
 * through here — a partial copy (like the old pedidos/[id] getStatus) showed
 * legacy 'rechazada' orders as "pendiente".
 */
export type OrderStatus = 'pendiente' | 'confirmado' | 'realizado' | 'rechazado';

export const ORDER_STATUSES: OrderStatus[] = ['pendiente', 'confirmado', 'realizado', 'rechazado'];

export function canonicalStatus(o: { status?: string | null; confirmed?: boolean | null }): OrderStatus {
  const s = o.status;
  if (s === 'realizado') return 'realizado';
  if (s === 'rechazado' || s === 'rechazada') return 'rechazado';
  if (s === 'confirmado' || s === 'aprobada' || s === 'deposito') return 'confirmado';
  if (s === 'pendiente' || s === 'nuevo') return 'pendiente';
  if (o.confirmed) return 'confirmado';
  return 'pendiente';
}
