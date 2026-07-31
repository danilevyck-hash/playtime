// Shared admin state, API helpers and types used across the tab components.
// Extracted verbatim from admin/page.tsx (no logic change) so each tab can live
// in its own file.
import { DBProduct, DBProductVariant } from '@/lib/supabase-data';
import type { OrderStatus } from '@/lib/order-status';

// ─── Session (single source of truth) ───
// Live module bindings: tabs READ _adminToken/_adminRole; AdminPage WRITES them
// through the setters (you can't reassign an imported binding from another module).
export let _adminToken = '';
export let _adminRole: 'admin' | 'vendedora' = 'admin';
export function setAdminToken(token: string) { _adminToken = token; }
export function setAdminRole(role: 'admin' | 'vendedora') { _adminRole = role; }

// ─── Vuelta del detalle al listado ───
// La marca la pone el listado al abrir un pedido y la consume el detalle. Sin
// ella no se puede saber si atrás hay un listado al que volver: entrar directo
// por URL (o desde una notificación) también monta el detalle, y ahí un
// history.back() sacaría al usuario de la app.
export const RETURN_TO_LIST_KEY = 'adminOrdersReturn';

// Filtro de estado activo del listado (Pendientes/Confirmados/…). Va en
// sessionStorage porque el listado se DESMONTA al abrir un pedido: sin esto,
// volver del detalle lo devolvía siempre a "Todos".
export const STATUS_FILTER_KEY = 'adminOrdersStatusFilter';

// Vuelta CONFIRMADA desde el detalle. La pone el detalle justo antes de
// history.back() y la consume el listado.
//
// 🩸 Sin esta marca no se puede distinguir "volví de un pedido" de "acabo de
// escribir el PIN". Los dos montan el listado por primera vez, pero solo el
// primero debe reponer el scroll: saltar apenas te autenticás es un salto que
// el usuario no pidió. RETURN_TO_LIST_KEY no sirve para esto — la consume el
// detalle al decidir si puede usar back(), así que ya no existe cuando el
// listado vuelve a montarse.
export const RETURN_FROM_DETAIL_KEY = 'adminOrdersBack';

/**
 * Key del scroll guardado, POR RUTA.
 *
 * Va por ruta y no en una sola global para que dos listados distintos no se
 * pisen la posición (hoy /admin, mañana cualquier otro que use el mismo patrón).
 * Y va en sessionStorage, no en estado de React: el listado se DESMONTA al
 * abrir el detalle, así que cualquier estado en memoria se pierde justo cuando
 * hace falta.
 */
export function scrollKeyFor(ruta: string): string {
  return `adminScroll:${ruta}`;
}

// ─── API helpers (server-side writes via service role) ───
export function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-admin-token': _adminToken, ...extra };
}

export async function apiUpsertSetting(key: string, value: unknown): Promise<boolean> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ key, value }),
  });
  return res.ok;
}

export async function apiUpsertProduct(data: Partial<DBProduct>) {
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
  return res.ok;
}

export async function apiUpsertVariant(data: DBProductVariant) {
  const res = await fetch('/api/products/variants', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('apiUpsertVariant failed:', res.status, errBody, 'data:', JSON.stringify(data));
  }
  return res.ok;
}

export async function apiDeleteProduct(id: string) {
  const res = await fetch('/api/products', {
    method: 'DELETE',
    headers: adminHeaders(),
    body: JSON.stringify({ id }),
  });
  return res.ok;
}

export async function apiDeleteVariant(productId: string, variantId: string) {
  const res = await fetch('/api/products/variants', {
    method: 'DELETE',
    headers: adminHeaders(),
    body: JSON.stringify({ productId, variantId }),
  });
  return res.ok;
}

export async function apiBulkUpdateOrder(ids: string[]) {
  const res = await fetch('/api/products/order', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ ids }),
  });
  return res.ok;
}

export function revalidateSite() {
  fetch('/api/revalidate', {
    method: 'POST',
    headers: { 'x-admin-token': _adminToken },
  }).catch(() => {});
}

// ─── Consts / small helpers ───
export const ALL_CATEGORIES = ['planes', 'spa', 'show', 'snacks', 'softplay', 'bounces', 'addons', 'creative'];
export const INPUT_CLS = 'w-full border-2 border-gray-200 rounded-xl py-2 px-3 font-body text-sm focus:border-purple focus:outline-none';
export const WI_CLS = 'w-full border border-gray-200 rounded-lg py-2 px-3 font-body text-sm focus:border-purple focus:outline-none';

export const ORDER_STATUSES: { key: OrderStatus; label: string; color: string; bg: string }[] = [
  { key: 'pendiente', label: 'Pendiente', color: 'text-gray-600', bg: 'bg-gray-200' },
  { key: 'confirmado', label: 'Confirmado', color: 'text-white', bg: 'bg-teal' },
  { key: 'realizado', label: 'Realizado', color: 'text-white', bg: 'bg-purple' },
  { key: 'rechazado', label: 'Rechazado', color: 'text-white', bg: 'bg-red-500' },
];

export const STATUS_HEX: Record<OrderStatus, string> = {
  pendiente: '#888780',
  confirmado: '#580459',
  realizado: '#1D9E75',
  rechazado: '#E24B4A',
};

const CATEGORY_EMOJI: Record<string, string> = {
  planes: '🎉', spa: '💅', show: '🎭', snacks: '🍿',
  softplay: '🏰', bounces: '🎪', addons: '🎈', creative: '🎨',
};
export function getCategoryEmoji(cat: string): string { return CATEGORY_EMOJI[cat] || '✨'; }

export function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function fmtTime12h(t: string) {
  if (!t) return '';
  const trimmed = t.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return trimmed;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m)) return trimmed;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${ap}`;
}

// ─── Order types ───
export interface OrderItem {
  id?: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface Deposit {
  amount: number;
  date: string;
}

export interface Order {
  id: number;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  event_date: string;
  event_time: string;
  event_area: string | null;
  event_address: string;
  birthday_child_name: string | null;
  birthday_child_age: number | null;
  payment_method: string;
  subtotal: number;
  surcharge: number;
  total: number;
  notes: string | null;
  internal_note: string | null;
  status: OrderStatus;
  deposit_amount: number | null;
  deposits: Deposit[];
  discount: number;
  discount_type: 'fixed' | 'percent';
  transport_cost_confirmed: number | null;
  created_at: string;
  confirmed: boolean;
  items: OrderItem[];
}
