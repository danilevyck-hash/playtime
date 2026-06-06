'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '@/lib/format';
import { EVENT_AREAS } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import {
  fetchSetting,
  fetchProductImages,
  fetchDBProducts,
  fetchDBProductVariants,
  DBProduct,
  DBProductVariant,
} from '@/lib/supabase-data';

// ─── API helpers (server-side writes via service role) ───
function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-admin-token': _adminToken, ...extra };
}

async function apiUpsertSetting(key: string, value: unknown): Promise<boolean> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ key, value }),
  });
  return res.ok;
}

async function apiUpsertProduct(data: Partial<DBProduct>) {
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
  return res.ok;
}

async function apiUpsertVariant(data: DBProductVariant) {
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

async function apiDeleteProduct(id: string) {
  const res = await fetch('/api/products', {
    method: 'DELETE',
    headers: adminHeaders(),
    body: JSON.stringify({ id }),
  });
  return res.ok;
}

async function apiDeleteVariant(productId: string, variantId: string) {
  const res = await fetch('/api/products/variants', {
    method: 'DELETE',
    headers: adminHeaders(),
    body: JSON.stringify({ productId, variantId }),
  });
  return res.ok;
}

async function apiBulkUpdateOrder(ids: string[]) {
  const res = await fetch('/api/products/order', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ ids }),
  });
  return res.ok;
}
import { CATEGORIES } from '@/lib/constants';
import { DEFAULT_SITE_TEXTS, SITE_TEXT_LABELS, SiteTexts, clearSiteTextsCache } from '@/lib/site-texts';

type OrderStatus = 'pendiente' | 'confirmado' | 'realizado' | 'rechazado';
const ORDER_STATUSES: { key: OrderStatus; label: string; color: string; bg: string }[] = [
  { key: 'pendiente', label: 'Pendiente', color: 'text-gray-600', bg: 'bg-gray-200' },
  { key: 'confirmado', label: 'Confirmado', color: 'text-white', bg: 'bg-teal' },
  { key: 'realizado', label: 'Realizado', color: 'text-white', bg: 'bg-purple' },
  { key: 'rechazado', label: 'Rechazado', color: 'text-white', bg: 'bg-red-500' },
];

const STATUS_HEX: Record<OrderStatus, string> = {
  pendiente: '#888780',
  confirmado: '#580459',
  realizado: '#1D9E75',
  rechazado: '#E24B4A',
};

const CATEGORY_EMOJI: Record<string, string> = {
  planes: '🎉', spa: '💅', show: '🎭', snacks: '🍿',
  softplay: '🏰', bounces: '🎪', addons: '🎈', creative: '🎨',
};
function getCategoryEmoji(cat: string): string { return CATEGORY_EMOJI[cat] || '✨'; }

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface OrderItem {
  id?: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Deposit {
  amount: number;
  date: string;
}

interface Order {
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

function getOrderStatus(order: Order): OrderStatus {
  // Map legacy statuses to new pipeline
  const s = order.status as string;
  if (s === 'realizado') return 'realizado';
  if (s === 'rechazado' || s === 'rechazada') return 'rechazado';
  if (s === 'confirmado' || s === 'aprobada' || s === 'deposito') return 'confirmado';
  if (s === 'pendiente' || s === 'nuevo') return 'pendiente';
  if (order.confirmed) return 'confirmado';
  return 'pendiente';
}

// Session token stored after server-side auth validation (single source of truth)
let _adminToken = '';
// Role: 'admin' has full access, 'vendedora' sees only Pedidos (no stats)
let _adminRole: 'admin' | 'vendedora' = 'admin';

// ─── ORDERS TAB ───
function fmtTime12h(t: string) {
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

function OrdersTab() {
  const { showToast } = useToast();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'realizado' | 'rejected'>('all');
  const [eventMonthFilter, setEventMonthFilter] = useState<string>('all'); // 'all' or 'YYYY-MM'
  const [sortMode, setSortMode] = useState<'created' | 'event'>('event');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/orders', { headers: { 'x-admin-token': _adminToken } });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setOrders(data.orders || []);
      if (data.message) setError(data.message);
    } catch {
      setError('No se pudieron cargar los pedidos. Verifica que Supabase est\u00e9 configurado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  const exportCSV = () => {
    const headers = ['#Pedido','Cliente','Tel\u00e9fono','Email','Fecha Evento','Hora','\u00c1rea','Direcci\u00f3n','Cumplea\u00f1ero','Edad','Tema','M\u00e9todo Pago','Subtotal','Transporte','Recargo','Total','Dep\u00f3sito','Saldo Pendiente','Estado','Nota Interna','Fecha Creaci\u00f3n'];
    const esc = (v: string | number | null | undefined) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = filteredOrders.map(o => {
      const dep = o.deposit_amount ?? 0;
      const theme = o.notes?.replace(/^Tema:\s*/, '') || '';
      return [o.order_number, o.customer_name, o.customer_phone, o.customer_email, o.event_date, o.event_time, o.event_area, o.event_address, o.birthday_child_name, o.birthday_child_age, theme, o.payment_method === 'bank_transfer' ? 'Transferencia' : 'Tarjeta', o.subtotal, o.transport_cost_confirmed ?? '', o.surcharge, o.total, dep, dep > 0 ? o.total - dep : '', getOrderStatus(o), o.internal_note, o.created_at].map(esc).join(',');
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'playtime-pedidos.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Filter orders by search + status + event month
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (statusFilter === 'confirmed') result = result.filter(o => getOrderStatus(o) === 'confirmado');
    else if (statusFilter === 'realizado') result = result.filter(o => getOrderStatus(o) === 'realizado');
    else if (statusFilter === 'pending') result = result.filter(o => getOrderStatus(o) === 'pendiente');
    else if (statusFilter === 'rejected') result = result.filter(o => getOrderStatus(o) === 'rechazado');
    if (eventMonthFilter !== 'all') {
      result = result.filter(o => (o.event_date || '').startsWith(eventMonthFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(o =>
        o.customer_name.toLowerCase().includes(q) || o.event_date.includes(q) ||
        String(o.order_number).includes(q) || (o.customer_phone && o.customer_phone.includes(q))
      );
    }
    // Sort: upcoming events first (asc from today), past events at the bottom (reverse chrono)
    const today = new Date().toISOString().split('T')[0];
    return [...result].sort((a, b) => {
      const aFuture = (a.event_date || '') >= today;
      const bFuture = (b.event_date || '') >= today;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return (a.event_date || '').localeCompare(b.event_date || '');
      return (b.event_date || '').localeCompare(a.event_date || '');
    });
  }, [orders, search, statusFilter, eventMonthFilter]);

  // Group by date for "by event" view.
  // Exception: en el filtro "Pendientes" se ordena/agrupa por fecha de CREACI\u00d3N
  // del pedido (created_at), del m\u00e1s reciente al m\u00e1s antiguo.
  const groupedByEvent = useMemo(() => {
    const pendingMode = statusFilter === 'pending';
    if (!pendingMode && sortMode !== 'event') return null;
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Mi\u00e9rcoles', 'Jueves', 'Viernes', 'S\u00e1bado'];
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const groups: { date: string; label: string; orders: Order[] }[] = [];
    if (pendingMode) {
      // M\u00e1s reciente primero por fecha de creaci\u00f3n; headers por fecha de creaci\u00f3n.
      const sorted = [...filteredOrders].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      for (const o of sorted) {
        const d = new Date(o.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const last = groups[groups.length - 1];
        if (last && last.date === key) { last.orders.push(o); } else {
          groups.push({ date: key, label: `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`, orders: [o] });
        }
      }
      return groups;
    }
    const sorted = [...filteredOrders].sort((a, b) => a.event_date.localeCompare(b.event_date));
    for (const o of sorted) {
      const last = groups[groups.length - 1];
      if (last && last.date === o.event_date) { last.orders.push(o); } else {
        const d = new Date(o.event_date + 'T00:00:00');
        groups.push({ date: o.event_date, label: `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`, orders: [o] });
      }
    }
    return groups;
  }, [filteredOrders, sortMode, statusFilter]);

  // Event months available for the dropdown filter (all months that have orders)
  const eventMonthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      if (o.event_date) set.add(o.event_date.substring(0, 7));
    }
    const todayKey = new Date().toISOString().substring(0, 7);
    return Array.from(set).sort((a, b) => {
      const aFuture = a >= todayKey;
      const bFuture = b >= todayKey;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return a.localeCompare(b);
      return b.localeCompare(a);
    }).map(month => {
      const [y, m] = month.split('-');
      const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      return { key: month, label: `${MESES[Number(m) - 1]} ${y}` };
    });
  }, [orders]);

  const { totalOrders, confirmedOrders, realizadoOrders, rejectedOrders, pendingOrders, confirmedRevenue } = useMemo(() => {
    const confirmed = orders.filter(o => getOrderStatus(o) === 'confirmado').length;
    const realizado = orders.filter(o => getOrderStatus(o) === 'realizado').length;
    const rejected = orders.filter(o => getOrderStatus(o) === 'rechazado').length;
    const pending = orders.filter(o => getOrderStatus(o) === 'pendiente').length;
    return {
      totalOrders: orders.length,
      confirmedOrders: confirmed,
      realizadoOrders: realizado,
      rejectedOrders: rejected,
      pendingOrders: pending,
      confirmedRevenue: orders.filter(o => o.confirmed).reduce((s, o) => s + o.total, 0),
    };
  }, [orders]);

  const goToOrder = (id: number) => router.push(`/admin/pedidos/${id}`);

  return (
    <div className="bg-white -mx-4 px-4 -my-6 py-6 min-h-[60vh]">
      {/* ─── HEADER ─── */}
      <div className="flex items-start justify-between mb-5">
        <div className="min-w-0">
          <h1 className="font-heading font-bold text-2xl text-gray-900">Pedidos</h1>
          <p className="font-body text-sm text-gray-400 mt-0.5">
            {totalOrders} pedido{totalOrders !== 1 ? 's' : ''}
            {_adminRole === 'admin' && ` · ${formatCurrency(confirmedRevenue)} confirmados`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setSearchOpen(s => !s)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${searchOpen ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            aria-label="Buscar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </button>
          <button
            onClick={() => setFiltersOpen(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors relative"
            aria-label="Filtros"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" /></svg>
            {(eventMonthFilter !== 'all' || sortMode === 'created') && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-purple" />
            )}
          </button>
        </div>
      </div>

      {/* ─── STATS BAR ─── */}
      {_adminRole === 'admin' && totalOrders > 0 && (
        <div className="grid grid-cols-4 border border-gray-200 rounded-xl mb-5 divide-x divide-gray-200">
          {[
            { label: 'Pendientes', value: pendingOrders, color: '#F27405' },
            { label: 'Confirmados', value: confirmedOrders, color: '#580459' },
            { label: 'Realizados', value: realizadoOrders, color: '#1D9E75' },
            { label: 'Rechazados', value: rejectedOrders, color: '#E24B4A' },
          ].map(stat => (
            <div key={stat.label} className="py-3 px-1 text-center">
              <p className="font-heading font-bold text-xl" style={{ color: stat.color }}>{stat.value}</p>
              <p className="font-body text-xs text-gray-400 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ─── STATUS PILLS ─── */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 mb-3" style={{ scrollSnapType: 'x mandatory' }}>
        {([
          ['pending', `Pendientes (${pendingOrders})`],
          ['confirmed', `Confirmados (${confirmedOrders})`],
          ['realizado', `Realizados (${realizadoOrders})`],
          ['rejected', `Rechazados (${rejectedOrders})`],
          ['all', `Todos (${totalOrders})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`shrink-0 px-4 py-1.5 min-h-[36px] rounded-full font-heading font-semibold text-xs transition-colors ${statusFilter === key ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            style={{ scrollSnapAlign: 'start' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── SEARCH (toggleable) ─── */}
      <div className={`overflow-hidden transition-all duration-200 ${searchOpen ? 'max-h-20 mb-4' : 'max-h-0'}`}>
        <div className="relative pt-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 mt-0.5 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, fecha o # pedido..."
            className="w-full pl-10 pr-10 py-2.5 border-2 border-gray-200 rounded-xl font-body text-sm focus:border-purple focus:outline-none"
            autoFocus={searchOpen}
          />
          {(search || searchOpen) && (
            <button
              onClick={() => { setSearch(''); setSearchOpen(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-gray-400 hover:text-gray-600"
              aria-label="Cerrar busqueda"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Active filters chips */}
      {(eventMonthFilter !== 'all') && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 bg-purple/10 text-purple text-xs font-heading font-semibold px-3 py-1 rounded-full">
            {eventMonthOptions.find(o => o.key === eventMonthFilter)?.label || 'Mes'}
            <button onClick={() => setEventMonthFilter('all')} className="hover:text-purple/60" aria-label="Quitar filtro de mes">{'×'}</button>
          </span>
        </div>
      )}

      {error && <div className="bg-yellow/20 border border-yellow rounded-xl p-4 mb-6"><p className="font-body text-sm text-gray-700">{error}</p></div>}

      {/* ─── LOADING SKELETON ─── */}
      {loading && (
        <div className="divide-y divide-gray-100">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="skeleton w-9 h-9 rounded-full" />
              <div className="flex-1">
                <div className="skeleton w-32 h-4 mb-1.5" />
                <div className="skeleton w-44 h-3" />
              </div>
              <div className="skeleton w-16 h-5" />
            </div>
          ))}
        </div>
      )}

      {/* ─── EMPTY ─── */}
      {!loading && filteredOrders.length === 0 && !error && (
        <div className="text-center py-16">
          <p className="font-heading font-bold text-lg text-gray-400 mb-1">{search ? 'No se encontraron pedidos' : 'No hay pedidos'}</p>
          <p className="font-body text-sm text-gray-400">{search ? 'Prueba con otro nombre o fecha' : 'Los pedidos aparecerán aquí'}</p>
        </div>
      )}

      {/* ─── ORDERS LIST (flat, with section headers) ─── */}
      {!loading && groupedByEvent ? (
        groupedByEvent.map(group => (
          <div key={group.date} className="mb-5">
            <h3 className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider mb-1 mt-3">{group.label}</h3>
            <div className="divide-y divide-gray-100">
              {group.orders.map(o => {
                const st = getOrderStatus(o);
                const stInfo = ORDER_STATUSES.find(s => s.key === st) || ORDER_STATUSES[0];
                return (
                  <button
                    key={o.id}
                    onClick={() => goToOrder(o.id)}
                    className="w-full flex items-center gap-3 py-3 hover:bg-gray-50 transition-colors text-left -mx-2 px-2 rounded-lg"
                  >
                    <div
                      className="rounded-full flex items-center justify-center text-white font-heading font-semibold text-sm flex-shrink-0"
                      style={{ width: 38, height: 38, backgroundColor: STATUS_HEX[st] }}
                      aria-hidden="true"
                    >
                      {getInitials(o.customer_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-medium text-sm text-gray-800 truncate">{o.customer_name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        #{o.order_number}
                        {o.event_time ? ` · ${fmtTime12h(o.event_time)}` : ''}
                        {o.event_area ? ` · ${o.event_area}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className="font-heading font-semibold text-sm text-gray-800">{formatCurrency(o.total)}</span>
                      <span className="text-xs font-heading mt-0.5" style={{ color: STATUS_HEX[st] }}>{stInfo.label}</span>
                    </div>
                    <span className="text-gray-300 text-lg leading-none flex-shrink-0">{'›'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      ) : !loading ? (
        <div className="divide-y divide-gray-100">
          {filteredOrders.map(o => {
            const st = getOrderStatus(o);
            const stInfo = ORDER_STATUSES.find(s => s.key === st) || ORDER_STATUSES[0];
            return (
              <button
                key={o.id}
                onClick={() => goToOrder(o.id)}
                className="w-full flex items-center gap-3 py-3 hover:bg-gray-50 transition-colors text-left -mx-2 px-2 rounded-lg"
              >
                <div
                  className="rounded-full flex items-center justify-center text-white font-heading font-semibold text-sm flex-shrink-0"
                  style={{ width: 38, height: 38, backgroundColor: STATUS_HEX[st] }}
                  aria-hidden="true"
                >
                  {getInitials(o.customer_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-medium text-sm text-gray-800 truncate">{o.customer_name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    #{o.order_number}
                    {o.event_time ? ` · ${fmtTime12h(o.event_time)}` : ''}
                    {o.event_area ? ` · ${o.event_area}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="font-heading font-semibold text-sm text-gray-800">{formatCurrency(o.total)}</span>
                  <span className="text-xs font-heading mt-0.5" style={{ color: STATUS_HEX[st] }}>{stInfo.label}</span>
                </div>
                <span className="text-gray-300 text-lg leading-none flex-shrink-0">{'›'}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* ─── FILTERS BOTTOM SHEET ─── */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setFiltersOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white w-full rounded-t-3xl shadow-2xl animate-sheet-up max-h-[85vh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="px-5 pb-3 flex items-center justify-between">
              <h2 className="font-heading font-bold text-lg text-gray-900">Filtros</h2>
              <button onClick={() => setFiltersOpen(false)} className="text-sm text-purple font-heading font-semibold">Aplicar</button>
            </div>

            <div className="px-5 space-y-5 pb-5">
              {eventMonthOptions.length > 0 && (
                <div>
                  <p className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Mes del evento</p>
                  <select
                    value={eventMonthFilter}
                    onChange={(e) => setEventMonthFilter(e.target.value)}
                    className="w-full bg-gray-100 text-gray-700 font-heading font-semibold text-sm rounded-xl px-3 py-3 border-0 focus:outline-none focus:ring-2 focus:ring-purple/30"
                  >
                    <option value="all">Todos los meses</option>
                    {eventMonthOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <p className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Ordenar por</p>
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => setSortMode('event')}
                    className={`flex-1 py-2 rounded-lg font-heading font-semibold text-sm transition-all ${sortMode === 'event' ? 'bg-white text-purple shadow-sm' : 'text-gray-500'}`}
                  >
                    Fecha evento
                  </button>
                  <button
                    onClick={() => setSortMode('created')}
                    className={`flex-1 py-2 rounded-lg font-heading font-semibold text-sm transition-all ${sortMode === 'created' ? 'bg-white text-purple shadow-sm' : 'text-gray-500'}`}
                  >
                    Fecha creación
                  </button>
                </div>
              </div>

              <div>
                <p className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Acciones</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { exportCSV(); showToast('CSV descargado'); }}
                    className="flex-1 py-3 rounded-xl font-heading font-semibold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Exportar CSV
                  </button>
                  <button
                    onClick={() => { fetchOrders(); }}
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl font-heading font-semibold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Cargando...' : '↺ Actualizar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PRODUCTS TAB ───
const ALL_CATEGORIES = ['planes', 'spa', 'show', 'snacks', 'softplay', 'bounces', 'addons', 'creative'];
const INPUT_CLS = 'w-full border-2 border-gray-200 rounded-xl py-2 px-3 font-body text-sm focus:border-purple focus:outline-none';

function ProductsTab() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<DBProduct[]>([]);
  const [variants, setVariants] = useState<DBProductVariant[]>([]);
  const [filter, setFilter] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', desc: '', price: '', cat: '', variant_label: '', featured: false, popular: false, max_quantity: '', min_quantity: '', quantity_step: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', cat: 'planes', price: '', desc: '' });
  const [uploading, setUploading] = useState('');
  const [imageKeys, setImageKeys] = useState<Record<string, number>>({});
  const [imageGalleries, setImageGalleries] = useState<Record<string, string[]>>({});
  const [reorderMode, setReorderMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [uploadingVariant, setUploadingVariant] = useState('');
  const [newVariant, setNewVariant] = useState<Record<string, { label: string; price: string }>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [combineMode, setCombineMode] = useState(false);
  const [combineSelected, setCombineSelected] = useState<Set<string>>(new Set());
  const [combinePrompt, setCombinePrompt] = useState(false);
  const [combineName, setCombineName] = useState('');
  const [allCategories, setAllCategories] = useState<string[]>(ALL_CATEGORIES);
  const [variantMenu, setVariantMenu] = useState<string | null>(null);

  // Cross-sell rules — loaded once, edited per-product, autosaved on toggle
  const [crossSellRules, setCrossSellRules] = useState<Record<string, string[]>>({});
  const [crossSellPicker, setCrossSellPicker] = useState<string | null>(null);

  // ─── LOAD from pt_products + pt_product_variants ───
  useEffect(() => {
    async function load() {
      try {
        const [dbProducts, dbVariants, customCats, rulesData] = await Promise.all([
          fetchDBProducts(),
          fetchDBProductVariants(),
          fetchSetting<Array<{ id: string; label: string; icon: string; description: string }>>('custom_categories'),
          fetchSetting<Record<string, string[]>>('cross_sell_rules'),
        ]);
        setProducts(dbProducts);
        setVariants(dbVariants);
        if (customCats && customCats.length > 0) {
          setAllCategories([...ALL_CATEGORIES, ...customCats.map(c => c.id)]);
        }
        if (rulesData && typeof rulesData === 'object') {
          setCrossSellRules(rulesData);
        } else {
          // Lazy import default rules
          const { DEFAULT_CROSS_SELL_RULES } = await import('@/lib/default-cross-sell-rules');
          setCrossSellRules({ ...DEFAULT_CROSS_SELL_RULES });
        }

        // Load gallery images
        const galleries: Record<string, string[]> = {};
        await Promise.all(dbProducts.map(async (p) => {
          const imgs = await fetchProductImages(p.id);
          if (imgs.length > 0) galleries[p.id] = imgs;
        }));
        setImageGalleries(galleries);
      } catch (e) {
        console.error('Load products error:', e);
      }
    }
    load();
  }, []);

  const toggleCrossSell = (productId: string, suggestId: string) => {
    setCrossSellRules(prev => {
      const current = prev[productId] || [];
      const next = current.includes(suggestId)
        ? current.filter(x => x !== suggestId)
        : current.length < 6 ? [...current, suggestId] : current;
      const updated = { ...prev, [productId]: next };
      // Auto-save (no manual button anymore)
      const clean: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(updated)) {
        if (Array.isArray(v) && v.length > 0) clean[k] = v;
      }
      apiUpsertSetting('cross_sell_rules', clean).then(() => revalidateSite()).catch(() => showToast('Error al guardar sugerencias'));
      return updated;
    });
  };

  const getVariants = useCallback((productId: string) => {
    return variants.filter(v => v.product_id === productId).sort((a, b) => a.sort_order - b.sort_order);
  }, [variants]);

  const getCatLabel = useCallback((catId: string) => {
    return CATEGORIES.find(c => c.id === catId)?.label || catId;
  }, []);

  // ─── UPLOAD IMAGE ───
  const handleUpload = async (productId: string, file: File, imageIndex = 0) => {
    if (file.size > 2 * 1024 * 1024) { showToast('Foto muy grande. Maximo 2MB'); return; }
    setUploading(`${productId}-${imageIndex}`);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', productId);
      formData.append('folder', 'products');
      formData.append('imageIndex', String(imageIndex));
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-token': _adminToken }, body: formData });
      if (res.ok) {
        const data = await res.json();
        const newUrl = data.path + '?t=' + Date.now();
        // Update UI immediately (optimistic)
        if (imageIndex === 0) {
          setProducts(prev => prev.map(p => p.id === productId ? { ...p, image_url: newUrl } : p));
          setImageKeys(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
        }
        const currentGallery = [...(imageGalleries[productId] || [])];
        while (currentGallery.length <= imageIndex) currentGallery.push('');
        currentGallery[imageIndex] = newUrl;
        if (imageIndex === 0) {
          const product = products.find(p => p.id === productId);
          currentGallery[0] = product?.image_url || newUrl;
        }
        setImageGalleries(prev => ({ ...prev, [productId]: currentGallery }));
        // Save to DB in background
        if (imageIndex === 0) {
          apiUpsertProduct({ id: productId, image_url: newUrl }).then(ok => {
            if (ok) revalidateSite();
            else showToast('Foto visible pero no se guardo en la base de datos');
          });
        }
        apiUpsertSetting(`product_images_${productId}`, currentGallery).then(ok => {
          if (!ok) showToast('Galeria no se guardo en la base de datos');
        });
        showToast('Foto actualizada');
      } else {
        const errBody = await res.json().catch(() => null);
        showToast(errBody?.error || (res.status === 401 ? 'Sesión expirada — recarga la página' : 'Error al subir foto'));
      }
    } catch (e) { console.error('Upload error:', e); showToast('Error de conexion'); }
    finally { setUploading(''); }
  };

  // ─── UPLOAD VARIANT IMAGE ───
  const handleVariantUpload = async (productId: string, variantId: string, file: File) => {
    if (file.size > 2 * 1024 * 1024) { showToast('Foto muy grande. Maximo 2MB'); return; }
    const key = `${productId}-${variantId}`;
    setUploadingVariant(key);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', `${productId}_variant_${variantId}`);
      formData.append('folder', 'variants');
      formData.append('imageIndex', '0');
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-token': _adminToken }, body: formData });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        console.error('Variant upload failed:', res.status, errBody);
        showToast(errBody?.error || (res.status === 401 ? 'Sesión expirada — recarga la página' : 'Error al subir foto'));
        return;
      }
      const data = await res.json();
      const newUrl = data.path + '?t=' + Date.now();
      const variant = variants.find(v => v.product_id === productId && v.id === variantId);
      if (!variant) { showToast('Variante no encontrada'); return; }
      const updated = { ...variant, image_url: newUrl };
      // Save to DB first, then update local state
      const saved = await apiUpsertVariant(updated);
      if (!saved) {
        console.error('Variant upsert failed for', productId, variantId);
        showToast('Error al guardar imagen en base de datos');
        return;
      }
      setVariants(prev => prev.map(v => (v.product_id === productId && v.id === variantId) ? updated : v));
      revalidateSite();
      showToast('Foto de variante actualizada');
    } catch (e) { console.error('Variant upload error:', e); showToast('Error de conexion'); }
    finally { setUploadingVariant(''); }
  };

  // ─── TOGGLE ACTIVE ───
  const toggleActive = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const nowActive = !product.active;
    setProducts(prev => prev.map(p => p.id === id ? { ...p, active: nowActive } : p));
    apiUpsertProduct({ id, active: nowActive }).then(() => revalidateSite()).catch(e => { console.error('Toggle error:', e); showToast('Error al guardar'); });
    showToast(nowActive ? 'Producto activado' : 'Producto desactivado');
  };

  // ─── START EDITING ───
  const startEdit = (p: DBProduct) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      desc: p.description,
      price: String(p.price),
      cat: p.category,
      variant_label: p.variant_label || '',
      featured: p.featured,
      popular: p.popular ?? false,
      max_quantity: p.max_quantity ? String(p.max_quantity) : '',
      min_quantity: p.min_quantity ? String(p.min_quantity) : '',
      quantity_step: p.quantity_step ? String(p.quantity_step) : '',
    });
  };

  // ─── SAVE EDIT ───
  const saveEdit = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const parsedPrice = parseFloat(editForm.price);
    const parsedMax = editForm.max_quantity ? parseInt(editForm.max_quantity) : null;
    const parsedMin = editForm.min_quantity ? parseInt(editForm.min_quantity) : null;
    const parsedStep = editForm.quantity_step ? parseInt(editForm.quantity_step) : null;
    const updated: DBProduct = {
      ...product,
      name: editForm.name || product.name,
      description: editForm.desc,
      price: isNaN(parsedPrice) ? product.price : parsedPrice,
      category: editForm.cat || product.category,
      variant_label: editForm.variant_label || null,
      featured: editForm.featured,
      popular: editForm.popular,
      max_quantity: parsedMax,
      min_quantity: parsedMin,
      quantity_step: parsedStep,
    };
    setProducts(prev => prev.map(p => p.id === id ? updated : p));
    setEditingId(null);
    const ok = await apiUpsertProduct({ id, name: updated.name, description: updated.description, price: updated.price, category: updated.category, variant_label: updated.variant_label, featured: updated.featured, popular: updated.popular, max_quantity: updated.max_quantity, min_quantity: updated.min_quantity, quantity_step: updated.quantity_step });
    if (ok) revalidateSite();
    showToast(ok ? 'Producto guardado' : 'Error al guardar');
  };

  // ─── ADD PRODUCT ───
  const handleAddProduct = async () => {
    if (!newProduct.name.trim()) return;
    const id = `prod-${Date.now()}`;
    const product: DBProduct = { id, name: newProduct.name, category: newProduct.cat, price: Number(newProduct.price) || 0, description: newProduct.desc, image_url: null, active: true, featured: false, popular: false, max_quantity: null, min_quantity: null, quantity_step: null, variant_label: null, sort_order: products.length };
    setProducts(prev => [...prev, product]);
    const ok = await apiUpsertProduct(product);
    setNewProduct({ name: '', cat: 'planes', price: '', desc: '' });
    setShowAdd(false);
    if (ok) {
      revalidateSite();
      showToast('Producto agregado');
    } else {
      // Roll back the optimistic insert so the UI matches reality.
      setProducts(prev => prev.filter(p => p.id !== id));
      showToast('Error al guardar el producto');
    }
  };

  // ─── DELETE PRODUCT ───
  const handleDelete = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    setProducts(prev => prev.filter(p => p.id !== id));
    setVariants(prev => prev.filter(v => v.product_id !== id));
    setConfirmDelete(null);
    setEditingId(null);
    const ok = await apiDeleteProduct(id);
    if (ok) revalidateSite();
    showToast(ok ? 'Producto eliminado' : 'Error al eliminar');
  };

  // ─── ADD VARIANT ───
  const handleAddVariant = async (productId: string) => {
    const form = newVariant[productId];
    if (!form || !form.label.trim()) return;
    const variantId = form.label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const existingVars = getVariants(productId);
    const variant: DBProductVariant = { id: variantId, product_id: productId, label: form.label.trim(), price: form.price ? parseFloat(form.price) : null, image_url: null, sort_order: existingVars.length };
    setVariants(prev => [...prev, variant]);
    setNewVariant(prev => ({ ...prev, [productId]: { label: '', price: '' } }));
    // If product has no variant_label yet, set default
    const product = products.find(p => p.id === productId);
    if (product && !product.variant_label) {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, variant_label: 'Modelo' } : p));
      apiUpsertProduct({ id: productId, variant_label: 'Modelo' }).catch(e => console.error('Set variant_label error:', e));
    }
    const ok = await apiUpsertVariant(variant);
    if (ok) revalidateSite();
    showToast(ok ? 'Variante agregada' : 'Error al agregar variante');
  };

  // ─── DELETE VARIANT ───
  const handleDeleteVariant = async (productId: string, variantId: string) => {
    const target = variants.find(v => v.product_id === productId && v.id === variantId);
    if (!window.confirm(`¿Eliminar la variante "${target?.label || variantId}"? Esta acción no se puede deshacer.`)) return;
    setVariants(prev => prev.filter(v => !(v.product_id === productId && v.id === variantId)));
    const remaining = variants.filter(v => v.product_id === productId && v.id !== variantId);
    if (remaining.length === 0) {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, variant_label: null } : p));
      apiUpsertProduct({ id: productId, variant_label: null }).catch(e => console.error('Clear variant_label error:', e));
    }
    const ok = await apiDeleteVariant(productId, variantId);
    if (ok) revalidateSite();
    showToast(ok ? 'Variante eliminada' : 'Error al eliminar variante');
  };

  // ─── EXTRACT VARIANT TO PRODUCT ───
  const handleExtractVariant = async (productId: string, variantId: string) => {
    const variant = variants.find(v => v.product_id === productId && v.id === variantId);
    const parent = products.find(p => p.id === productId);
    if (!variant || !parent) return;
    // Create new product
    const newId = `prod-${Date.now()}`;
    const newProd: DBProduct = { id: newId, name: variant.label, category: parent.category, price: variant.price ?? parent.price, description: '', image_url: variant.image_url, active: true, featured: false, popular: false, max_quantity: null, min_quantity: null, quantity_step: null, variant_label: null, sort_order: products.length };
    setProducts(prev => [...prev, newProd]);
    await apiUpsertProduct(newProd);
    // Remove variant
    setVariants(prev => prev.filter(v => !(v.product_id === productId && v.id === variantId)));
    await apiDeleteVariant(productId, variantId);
    const remaining = variants.filter(v => v.product_id === productId && v.id !== variantId);
    if (remaining.length === 0) {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, variant_label: null } : p));
      await apiUpsertProduct({ id: productId, variant_label: null });
    }
    setVariantMenu(null);
    revalidateSite();
    showToast(`"${variant.label}" ahora es producto independiente`);
  };

  // ─── COMBINE PRODUCTS ───
  const handleCombine = async () => {
    if (!combineName.trim() || combineSelected.size < 2) return;
    const selected = products.filter(p => combineSelected.has(p.id));
    const [first, ...rest] = selected;
    // Update first product as the combined one
    const updated: DBProduct = { ...first, name: combineName.trim(), variant_label: 'Modelo' };
    setProducts(prev => prev.map(p => p.id === first.id ? updated : p));
    await apiUpsertProduct({ id: first.id, name: updated.name, variant_label: 'Modelo' });
    // Convert rest into variants of first
    const existingVars = getVariants(first.id);
    let sortIdx = existingVars.length;
    // Also add original first as variant
    const firstVariantId = first.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const firstVariant: DBProductVariant = { id: firstVariantId, product_id: first.id, label: first.name, price: first.price, image_url: first.image_url, sort_order: sortIdx++ };
    setVariants(prev => [...prev, firstVariant]);
    await apiUpsertVariant(firstVariant);
    for (const p of rest) {
      const varId = p.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const variant: DBProductVariant = { id: varId, product_id: first.id, label: p.name, price: p.price, image_url: p.image_url, sort_order: sortIdx++ };
      setVariants(prev => [...prev, variant]);
      await apiUpsertVariant(variant);
      // Delete the product
      setProducts(prev => prev.filter(pr => pr.id !== p.id));
      await apiDeleteProduct(p.id);
    }
    setCombineMode(false);
    setCombineSelected(new Set());
    setCombinePrompt(false);
    setCombineName('');
    revalidateSite();
    showToast(`${selected.length} productos combinados`);
  };

  // ─── REORDER ───
  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const fromIdx = products.findIndex(p => p.id === draggingId);
    const toIdx = products.findIndex(p => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newProducts = [...products];
    const [moved] = newProducts.splice(fromIdx, 1);
    newProducts.splice(toIdx, 0, moved);
    setProducts(newProducts);
    apiBulkUpdateOrder(newProducts.map(p => p.id)).then(() => revalidateSite()).catch(e => console.error('Save order error:', e));
    setDraggingId(null);
    setDragOverId(null);
  };

  const filtered = useMemo(() => {
    const isSearching = productSearch.trim() !== '';
    return products.filter(p => {
      const matchFilter = isSearching || !filter || p.category === filter;
      const matchSearch = !isSearching || p.name.toLowerCase().includes(productSearch.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [products, filter, productSearch]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 className="font-heading font-bold text-xl text-purple">Productos</h2>
            {!combineMode && (
              <button onClick={() => setShowAdd(!showAdd)} className="bg-purple text-white font-heading font-bold w-9 h-9 rounded-full text-base hover:bg-purple-light transition-colors flex items-center justify-center flex-shrink-0" aria-label="Nuevo producto">
                {showAdd ? '\u00D7' : '+'}
              </button>
            )}
          </div>
          <p className="font-body text-gray-500 text-xs mt-0.5">{products.length} productos en la base de datos</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {!combineMode && (
            <>
              <button onClick={() => { setCombineMode(true); setCombineSelected(new Set()); }} className="font-heading font-bold px-3 py-2 rounded-xl text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Combinar</button>
              <button onClick={() => { setReorderMode(!reorderMode); if (reorderMode) showToast('Orden guardado'); }} className={`font-heading font-bold px-3 py-2 rounded-xl text-xs transition-colors ${reorderMode ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {reorderMode ? '\u2713 Listo' : '\u21C5 Ordenar'}
              </button>
            </>
          )}
          {combineMode && (
            <button onClick={() => { setCombineMode(false); setCombineSelected(new Set()); }} className="font-heading font-bold px-3 py-2 rounded-xl text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className={`relative ${reorderMode ? 'opacity-50 pointer-events-none' : ''}`}>
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar producto..." className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl font-body text-sm focus:border-purple focus:outline-none" />
        {productSearch && (
          <button onClick={() => setProductSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Add product form */}
      {showAdd && (
        <div className="bg-white rounded-xl border-2 border-purple/20 p-5 space-y-3">
          <h3 className="font-heading font-bold text-sm text-purple">Nuevo Producto</h3>
          <input type="text" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Nombre" className={INPUT_CLS} />
          <div className="grid grid-cols-2 gap-3">
            <select value={newProduct.cat} onChange={(e) => setNewProduct({ ...newProduct, cat: e.target.value })} className={INPUT_CLS}>{allCategories.map(c => <option key={c} value={c}>{getCatLabel(c)}</option>)}</select>
            <input type="number" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} placeholder="Precio ($)" className={INPUT_CLS} />
          </div>
          <input type="text" value={newProduct.desc} onChange={(e) => setNewProduct({ ...newProduct, desc: e.target.value })} placeholder="Descripcion" className={INPUT_CLS} />
          <button onClick={handleAddProduct} disabled={!newProduct.name.trim()} className="w-full bg-purple text-white font-heading font-bold py-2.5 rounded-xl disabled:opacity-50">Agregar</button>
        </div>
      )}

      {/* Category filter — horizontal scroll */}
      <div className={`flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 ${reorderMode ? 'opacity-50 pointer-events-none' : ''}`} style={{ scrollSnapType: 'x mandatory' }}>
        {allCategories.map(c => (
          <button key={c} onClick={() => setFilter(filter === c ? '' : c)} className={`shrink-0 px-3 py-1.5 min-h-[36px] rounded-full text-xs font-heading font-semibold transition-colors ${filter === c ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} style={{ scrollSnapAlign: 'start' }}>{getCatLabel(c)}</button>
        ))}
      </div>

      {/* Product list */}
      {filtered.length === 0 ? (
        <div className="text-center py-6">
          <p className="font-body text-sm text-gray-400">No hay productos que coincidan</p>
        </div>
      ) : (
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
        {filtered.map((product) => {
          const isEditing = editingId === product.id;
          const imgSrc = product.image_url || '';
          const prodVariants = getVariants(product.id);
          const isCombineSelected = combineSelected.has(product.id);

          return (
            <div
              key={product.id}
              draggable={reorderMode}
              onDragStart={() => { if (reorderMode) setDraggingId(product.id); }}
              onDragOver={(e) => { if (reorderMode) { e.preventDefault(); setDragOverId(product.id); } }}
              onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
              onDrop={() => { if (reorderMode) handleDrop(product.id); }}
              className={`p-3 transition-all ${!product.active ? 'opacity-40' : ''} ${draggingId === product.id ? 'opacity-40 scale-95' : ''} ${dragOverId === product.id && draggingId !== product.id ? 'border-t-2 border-t-purple' : ''} ${isCombineSelected ? 'bg-purple/5' : ''}`}
            >
              {/* Collapsed view */}
              <div className="flex items-center gap-3" onClick={() => { if (combineMode) { setCombineSelected(prev => { const next = new Set(prev); if (next.has(product.id)) next.delete(product.id); else next.add(product.id); return next; }); } }}>
                {/* Combine checkbox / Toggle / Drag handle */}
                {combineMode ? (
                  <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center ${isCombineSelected ? 'bg-purple border-purple' : 'border-gray-300'}`}>
                    {isCombineSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                ) : reorderMode ? (
                  <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-purple select-none text-lg leading-none px-1">{'\u2807'}</div>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); toggleActive(product.id); }} className={`flex-shrink-0 transition-colors relative rounded-full`} style={{ width: 44, height: 26, backgroundColor: product.active ? '#1D9E75' : '#D1D5DB' }} aria-label={product.active ? 'Desactivar' : 'Activar'}>
                    <div className="bg-white rounded-full absolute transition-all shadow-sm" style={{ width: 20, height: 20, top: 3, left: product.active ? 21 : 3 }} />
                  </button>
                )}

                {/* Thumbnail 52x52 */}
                <div className="bg-gray-100 overflow-hidden flex-shrink-0" style={{ width: 52, height: 52, borderRadius: 10 }}>
                  {imgSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${product.id}-${imageKeys[product.id] || 0}`} src={imgSrc} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">{getCategoryEmoji(product.category)}</div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0" onClick={(e) => { if (!combineMode) { e.stopPropagation(); if (isEditing) { setEditingId(null); } else { startEdit(product); } } }}>
                  <p className="font-heading font-semibold text-sm text-gray-800 truncate">{product.name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="font-body text-xs text-gray-400">${product.price}</span>
                    <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-heading font-semibold text-gray-500">{getCatLabel(product.category)}</span>
                    {prodVariants.length > 0 && <span className="text-[10px] text-purple font-heading font-semibold">{prodVariants.length} var.</span>}
                    {product.featured && <span className="text-[10px] text-orange font-heading font-bold">DEST.</span>}
                    {product.popular && <span className="text-[10px] text-orange font-heading font-bold">POP.</span>}
                  </div>
                </div>

                {/* Copiar link directo al producto */}
                {!combineMode && !reorderMode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = `${window.location.origin}/catalogo/${product.id}`;
                      const fallback = () => {
                        try {
                          const ta = document.createElement('textarea');
                          ta.value = url;
                          ta.style.position = 'fixed';
                          ta.style.opacity = '0';
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                          showToast('Link copiado');
                        } catch {
                          showToast('No se pudo copiar el link');
                        }
                      };
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(url).then(() => showToast('Link copiado')).catch(fallback);
                      } else {
                        fallback();
                      }
                    }}
                    className="text-gray-400 hover:text-purple flex-shrink-0 p-1.5 rounded-lg hover:bg-purple/5 transition-colors"
                    aria-label="Copiar link del producto"
                    title="Copiar link"
                  >
                    {'🔗'}
                  </button>
                )}
              </div>

              {/* Expanded edit form */}
              {isEditing && !combineMode && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Nombre" className={INPUT_CLS} />
                  <input type="text" value={editForm.desc} onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })} placeholder="Descripcion" className={INPUT_CLS} />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} placeholder="Precio" className={INPUT_CLS} />
                    <select value={editForm.cat} onChange={(e) => setEditForm({ ...editForm, cat: e.target.value })} className={INPUT_CLS}>
                      {allCategories.map(c => <option key={c} value={c}>{getCatLabel(c)}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" min="1" value={editForm.min_quantity} onChange={(e) => setEditForm({ ...editForm, min_quantity: e.target.value })} placeholder="Min. unidades" className={INPUT_CLS} />
                    <input type="number" min="1" value={editForm.quantity_step} onChange={(e) => setEditForm({ ...editForm, quantity_step: e.target.value })} placeholder="Paquete de" className={INPUT_CLS} />
                    <input type="number" value={editForm.max_quantity} onChange={(e) => setEditForm({ ...editForm, max_quantity: e.target.value })} placeholder="Max. unidades" className={INPUT_CLS} />
                  </div>
                  <p className="font-body text-[10px] text-gray-400 -mt-1">Ejemplo silla: min=8, paquete=8 → suma de 8 en 8</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editForm.featured} onChange={(e) => setEditForm({ ...editForm, featured: e.target.checked })} className="w-4 h-4 accent-purple rounded" />
                      <span className="font-body text-sm text-gray-600">Destacado</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editForm.popular} onChange={(e) => setEditForm({ ...editForm, popular: e.target.checked })} className="w-4 h-4 accent-orange rounded" />
                      <span className="font-body text-sm text-gray-600">Popular</span>
                    </label>
                  </div>

                  {/* Image gallery (3 slots) */}
                  <div>
                    <p className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Fotos</p>
                    <div className="flex gap-2">
                      {[0, 1, 2].map(idx => {
                        const gallery = imageGalleries[product.id] || [];
                        const slotUrl = idx === 0 ? imgSrc : (gallery[idx] || '');
                        const isUploading = uploading === `${product.id}-${idx}`;
                        return (
                          <label key={idx} className="w-16 h-16 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer relative group">
                            {slotUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={`${product.id}-${idx}-${imageKeys[product.id] || 0}`} src={slotUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs font-bold">+</div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </div>
                            <input type="file" accept="image/*" className="hidden" disabled={!!uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(product.id, f, idx); }} />
                            {isUploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><div className="w-3 h-3 border-2 border-purple border-t-transparent rounded-full animate-spin" /></div>}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cross-sell rules section */}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider">Sugeridos al agregar</p>
                      <span className="font-heading font-bold text-[10px] text-orange">
                        {(crossSellRules[product.id] || []).length}/6
                      </span>
                    </div>
                    {(crossSellRules[product.id] || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {(crossSellRules[product.id] || []).map(sid => {
                          const sp = products.find(x => x.id === sid);
                          return (
                            <span key={sid} className="inline-flex items-center gap-1 bg-orange/10 text-orange px-2 py-0.5 rounded-full text-[10px] font-heading font-semibold">
                              {sp?.name || sid}
                              <button
                                onClick={() => toggleCrossSell(product.id, sid)}
                                className="hover:text-red-500"
                                aria-label="Quitar sugerido"
                              >{'\u00d7'}</button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <button
                      onClick={() => setCrossSellPicker(crossSellPicker === product.id ? null : product.id)}
                      className="text-[10px] font-heading font-semibold text-purple hover:text-purple-light"
                    >
                      {crossSellPicker === product.id ? '\u2191 Cerrar' : '+ Agregar producto sugerido'}
                    </button>
                    {crossSellPicker === product.id && (
                      <div className="mt-2 max-h-[200px] overflow-y-auto bg-gray-50 rounded-lg p-2 space-y-0.5">
                        {products.filter(p => p.active && p.id !== product.id).map(p => {
                          const checked = (crossSellRules[product.id] || []).includes(p.id);
                          const disabled = !checked && (crossSellRules[product.id] || []).length >= 6;
                          return (
                            <label key={p.id} className={`flex items-center gap-2 p-1 rounded cursor-pointer text-xs ${checked ? 'bg-orange/10' : 'hover:bg-white'} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}>
                              <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCrossSell(product.id, p.id)} className="w-3 h-3 accent-orange" />
                              <span className="font-body text-gray-700 truncate flex-1">{p.name}</span>
                              <span className="font-body text-gray-400 text-[10px]">{formatCurrency(p.price)}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Variants section */}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider">Variantes</p>
                        {(product.variant_label || prodVariants.length > 0) && (
                          <input type="text" value={editForm.variant_label} onChange={(e) => setEditForm({ ...editForm, variant_label: e.target.value })} placeholder="Label (ej: Color)" className="border border-gray-200 rounded-lg px-2 py-0.5 text-xs font-body w-24 focus:border-purple focus:outline-none" />
                        )}
                      </div>
                      {(product.variant_label || prodVariants.length > 0) ? (
                        <button onClick={() => setNewVariant(prev => ({ ...prev, [product.id]: { label: '', price: '' } }))} className="text-purple font-heading font-bold text-xs">+ Agregar</button>
                      ) : (
                        <button onClick={() => {
                          setEditForm(prev => ({ ...prev, variant_label: 'Modelo' }));
                          setNewVariant(prev => ({ ...prev, [product.id]: { label: '', price: '' } }));
                        }} className="text-purple font-heading font-bold text-xs">Agregar variantes</button>
                      )}
                    </div>

                    {/* Existing variants */}
                    {prodVariants.map(v => (
                      <div key={v.id} className="flex items-center gap-2 mb-1.5 bg-gray-50 rounded-lg p-2 relative">
                        <label className="w-9 h-9 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer relative group">
                          {v.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.image_url} alt={v.label} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px] font-bold">+</div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                          <input type="file" accept="image/*" className="hidden" disabled={!!uploadingVariant} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVariantUpload(product.id, v.id, f); }} />
                          {uploadingVariant === `${product.id}-${v.id}` && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><div className="w-2 h-2 border-2 border-purple border-t-transparent rounded-full animate-spin" /></div>}
                        </label>
                        <div className="flex-1 min-w-0">
                          <span className="font-heading text-xs text-gray-700 truncate block">{v.label}</span>
                          <textarea
                            defaultValue={v.description || ''}
                            placeholder="Descripción de esta variante (opcional)"
                            rows={1}
                            className="w-full border border-gray-200 rounded-md px-1.5 py-0.5 text-[10px] font-body text-gray-500 mt-0.5 resize-none focus:border-purple focus:outline-none"
                            onBlur={(e) => {
                              const newDesc = e.target.value.trim();
                              const oldDesc = v.description || '';
                              if (newDesc === oldDesc) return;
                              const updated = { ...v, description: newDesc || null };
                              setVariants(prev => prev.map(vv => (vv.product_id === v.product_id && vv.id === v.id) ? updated : vv));
                              apiUpsertVariant(updated).then(ok => { if (ok) revalidateSite(); else showToast('Error al guardar descripción'); });
                            }}
                          />
                        </div>
                        {v.price !== null && <span className="font-body text-xs text-gray-400 flex-shrink-0">${v.price}</span>}
                        {/* Menu button */}
                        <button onClick={() => setVariantMenu(variantMenu === `${product.id}-${v.id}` ? null : `${product.id}-${v.id}`)} className="text-gray-400 hover:text-gray-600 px-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                        </button>
                        <button onClick={() => handleDeleteVariant(product.id, v.id)} className="text-gray-400 hover:text-red-500 flex-shrink-0">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        {/* Variant menu dropdown */}
                        {variantMenu === `${product.id}-${v.id}` && (
                          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-10 min-w-[180px]">
                            <button onClick={() => handleExtractVariant(product.id, v.id)} className="w-full text-left px-3 py-2 font-body text-xs text-gray-700 hover:bg-gray-50">
                              Hacer producto independiente
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add variant inline form */}
                    {newVariant[product.id] && (
                      <div className="flex items-center gap-2 mt-1">
                        <input type="text" value={newVariant[product.id].label} onChange={(e) => setNewVariant(prev => ({ ...prev, [product.id]: { ...prev[product.id], label: e.target.value } }))} placeholder="Nombre de variante" className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-body focus:border-purple focus:outline-none" />
                        <input type="number" value={newVariant[product.id].price} onChange={(e) => setNewVariant(prev => ({ ...prev, [product.id]: { ...prev[product.id], price: e.target.value } }))} placeholder="$ (opc)" className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-body focus:border-purple focus:outline-none" />
                        <button onClick={() => handleAddVariant(product.id)} disabled={!newVariant[product.id]?.label.trim()} className="bg-purple text-white font-heading font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50">+</button>
                        <button onClick={() => setNewVariant(prev => { const n = { ...prev }; delete n[product.id]; return n; })} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setEditingId(null)} className="flex-1 border-2 border-gray-200 text-gray-600 font-heading font-semibold py-2 rounded-xl text-sm">Cancelar</button>
                    <button onClick={() => saveEdit(product.id)} className="flex-1 bg-purple text-white font-heading font-semibold py-2 rounded-xl text-sm">Guardar</button>
                    <button onClick={() => setConfirmDelete(product.id)} className="px-4 bg-red-50 text-red-500 font-heading font-semibold py-2 rounded-xl text-sm hover:bg-red-100">Eliminar</button>
                  </div>

                  {/* Confirm delete dialog */}
                  {confirmDelete === product.id && (
                    <div className="bg-red-50 rounded-xl p-3 border border-red-200">
                      <p className="font-body text-sm text-red-700 mb-2">Eliminar &ldquo;{product.name}&rdquo;? Esta accion no se puede deshacer.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-1.5 rounded-lg text-xs">Cancelar</button>
                        <button onClick={() => handleDelete(product.id)} className="flex-1 bg-red-500 text-white font-heading font-semibold py-1.5 rounded-lg text-xs">Eliminar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-6">
            <p className="font-body text-sm text-gray-400">No se encontraron productos</p>
          </div>
        )}
      </div>
      )}

      {/* Combine bottom bar */}
      {combineMode && combineSelected.size >= 2 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50 safe-area-pb">
          {!combinePrompt ? (
            <button onClick={() => { setCombinePrompt(true); setCombineName(''); }} className="w-full bg-purple text-white font-heading font-bold py-3 rounded-xl text-sm">
              Combinar ({combineSelected.size})
            </button>
          ) : (
            <div className="space-y-2">
              <p className="font-heading font-semibold text-sm text-gray-700">Nombre del producto combinado:</p>
              <input type="text" value={combineName} onChange={(e) => setCombineName(e.target.value)} placeholder="Nombre del producto" className={INPUT_CLS} autoFocus />
              <div className="flex gap-2">
                <button onClick={() => setCombinePrompt(false)} className="flex-1 border-2 border-gray-200 text-gray-600 font-heading font-semibold py-2.5 rounded-xl text-sm">Cancelar</button>
                <button onClick={handleCombine} disabled={!combineName.trim()} className="flex-1 bg-purple text-white font-heading font-bold py-2.5 rounded-xl text-sm disabled:opacity-50">Combinar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CATALOG TAB ───
function CatalogTab() {
  const { showToast } = useToast();
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string; icon: string; description: string; subtitle?: string }[]>([]);
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', emoji: '', description: '' });
  const [catDragging, setCatDragging] = useState<string | null>(null);
  const [catDragOver, setCatDragOver] = useState<string | null>(null);

  useEffect(() => { fetchDBProducts().then(setDbProducts).catch(() => {}); }, []);

  const handleCatDrop = (targetId: string) => {
    if (!catDragging || catDragging === targetId) return;
    const fromIdx = categories.findIndex(c => c.id === catDragging);
    const toIdx = categories.findIndex(c => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newCats = [...categories];
    const [moved] = newCats.splice(fromIdx, 1);
    newCats.splice(toIdx, 0, moved);
    setCategories(newCats);
    apiUpsertSetting('category_order', newCats.map(c => c.id)).catch(e => console.error('Save cat order:', e));
    setCatDragging(null);
    setCatDragOver(null);
    showToast('Orden guardado');
  };

  // Count products per category
  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of dbProducts) { counts[p.category] = (counts[p.category] || 0) + 1; }
    return counts;
  }, [dbProducts]);

  useEffect(() => {
    async function load() {
      const base = CATEGORIES.map(c => ({ ...c }));
      try {
        const [overrides, customCats] = await Promise.all([
          fetchSetting<Record<string, { name?: string; subtitle?: string; emoji?: string }>>('category_overrides'),
          fetchSetting<Array<{ id: string; label: string; icon: string; description: string }>>('custom_categories'),
        ]);
        if (overrides) {
          for (const cat of base) {
            const ov = overrides[cat.id];
            if (ov) {
              if (ov.name) cat.label = ov.name;
              if (ov.subtitle) cat.subtitle = ov.subtitle;
              if (ov.emoji) cat.icon = ov.emoji;
            }
          }
        }
        if (customCats && customCats.length > 0) {
          const ids = new Set<string>(base.map(c => c.id));
          for (const cc of customCats) { if (!ids.has(cc.id)) (base as Array<{ id: string; label: string; icon: string; description: string; subtitle?: string }>).push(cc); }
        }
      } catch (e) {
        console.error('Error loading category overrides:', e);
      }
      // Apply saved order
      const savedOrder = await fetchSetting<string[]>('category_order');
      if (savedOrder && savedOrder.length > 0) {
        const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
        base.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity));
      }
      setCategories(base);
    }
    load();
  }, []);

  const startEdit = (cat: typeof categories[0]) => {
    setEditingCatId(cat.id);
    setEditForm({ name: cat.label, emoji: cat.icon, subtitle: cat.subtitle || '' });
  };

  const saveEdit = async () => {
    if (!editingCatId) return;
    setSaving(true);
    // Build full overrides map
    const overrides: Record<string, { name?: string; subtitle?: string; emoji?: string }> = {};
    for (const cat of categories) {
      const orig = CATEGORIES.find(c => c.id === cat.id);
      if (!orig) continue;
      const ov: { name?: string; subtitle?: string; emoji?: string } = {};
      const isEditing = cat.id === editingCatId;
      const name = isEditing ? editForm.name : cat.label;
      const emoji = isEditing ? editForm.emoji : cat.icon;
      const subtitle = isEditing ? editForm.subtitle : (cat.subtitle || '');
      if (name !== orig.label) ov.name = name;
      if (emoji !== orig.icon) ov.emoji = emoji;
      if (subtitle !== (orig.subtitle || '')) ov.subtitle = subtitle;
      if (Object.keys(ov).length > 0) overrides[cat.id] = ov;
    }
    await apiUpsertSetting('category_overrides', overrides);
    setCategories(prev => prev.map(c => c.id === editingCatId ? { ...c, label: editForm.name, icon: editForm.emoji, subtitle: editForm.subtitle || undefined } : c));
    setEditingCatId(null);
    setSaving(false);
    showToast('Categor\u00eda guardada');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-xl text-purple mb-1">Cat&aacute;logo</h2>
          <p className="font-body text-gray-500 text-sm">Edita nombre, emoji y subt&iacute;tulo de cada categor&iacute;a</p>
        </div>
        <button onClick={() => setShowNewCat(!showNewCat)} className="bg-purple text-white font-heading font-bold px-4 py-2 rounded-xl text-sm hover:bg-purple-light transition-colors">{showNewCat ? 'Cancelar' : '+ Nueva categoría'}</button>
      </div>

      {showNewCat && (
        <div className="bg-white rounded-xl border-2 border-purple/20 p-5 space-y-3">
          <h3 className="font-heading font-bold text-sm text-purple">Nueva Categor&iacute;a</h3>
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <input value={newCat.emoji} onChange={e => setNewCat(p => ({ ...p, emoji: e.target.value }))} placeholder="{'\uD83C\uDF88'}" maxLength={4} className="border border-gray-200 rounded-lg py-1.5 px-2 font-body text-center text-lg focus:border-purple focus:outline-none" />
            <input value={newCat.name} onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))} placeholder="Nombre de la categor&iacute;a" className="border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none" />
          </div>
          <input value={newCat.description} onChange={e => setNewCat(p => ({ ...p, description: e.target.value }))} placeholder="Descripci&oacute;n corta" className="w-full border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none" />
          <button
            onClick={async () => {
              const id = newCat.name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
              if (!id) { showToast('Nombre inv\u00e1lido'); return; }
              if ([...ALL_CATEGORIES, ...categories.map(c => c.id)].includes(id)) { showToast('Esa categor\u00eda ya existe'); return; }
              const item = { id, label: newCat.name.trim(), icon: newCat.emoji || '\uD83C\uDF88', description: newCat.description.trim() };
              const existing = await fetchSetting<Array<{ id: string; label: string; icon: string; description: string }>>('custom_categories') || [];
              await apiUpsertSetting('custom_categories', [...existing, item]);
              setCategories(prev => [...prev, item]);
              setNewCat({ name: '', emoji: '', description: '' });
              setShowNewCat(false);
              showToast('Categor\u00eda creada');
            }}
            disabled={!newCat.name.trim()}
            className="w-full bg-purple text-white font-heading font-bold py-2.5 rounded-xl disabled:opacity-50"
          >
            Crear categor&iacute;a
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
        {categories.map((cat, idx) => {
          const isExpanded = expandedCatId === cat.id;
          const isEditing = editingCatId === cat.id;
          const count = productCounts[cat.id] || 0;
          const palette = ['#580459', '#84D9D0', '#F27405', '#F27289', '#49B3BF', '#F2C84B'];
          const bgColor = palette[idx % palette.length];

          return (
            <div
              key={cat.id}
              draggable
              onDragStart={() => setCatDragging(cat.id)}
              onDragOver={(e) => { e.preventDefault(); setCatDragOver(cat.id); }}
              onDragEnd={() => { setCatDragging(null); setCatDragOver(null); }}
              onDrop={() => handleCatDrop(cat.id)}
              className={`transition-all ${catDragging === cat.id ? 'opacity-40 scale-95' : ''} ${catDragOver === cat.id && catDragging !== cat.id ? 'border-t-2 border-t-purple' : ''}`}
            >
              <div className="flex items-center">
                <div className="pl-3 pr-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-purple select-none text-lg">{'\u2807'}</div>
                <button onClick={() => { setExpandedCatId(isExpanded ? null : cat.id); if (isEditing) setEditingCatId(null); }} className="flex-1 text-left p-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                      style={{ backgroundColor: `${bgColor}20`, color: bgColor }}
                      aria-hidden="true"
                    >
                      {cat.icon}
                    </span>
                    <div className="min-w-0">
                      <span className="font-heading font-semibold text-sm text-gray-800 block truncate">{cat.label}</span>
                      {cat.subtitle && <p className="font-body text-xs text-gray-400 mt-0.5 truncate">{cat.subtitle}</p>}
                    </div>
                  </div>
                  <span className="text-xs font-heading font-semibold text-gray-400 flex-shrink-0">{count} prod.</span>
                </div>
              </button>
              </div>
              {isExpanded && (
                <div className="border-t border-gray-100 p-4">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[60px_1fr] gap-2">
                        <input value={editForm.emoji || ''} onChange={e => setEditForm(p => ({ ...p, emoji: e.target.value }))} placeholder="Emoji" className="border border-gray-200 rounded-lg py-1.5 px-2 font-body text-center text-lg focus:border-purple focus:outline-none" />
                        <input value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre" className="border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none" />
                      </div>
                      <input value={editForm.subtitle || ''} onChange={e => setEditForm(p => ({ ...p, subtitle: e.target.value }))} placeholder={"Subtítulo (opcional)"} className="w-full border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none" />
                      <div className="flex gap-2">
                        <button onClick={() => setEditingCatId(null)} className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-2 rounded-xl text-sm">Cancelar</button>
                        <button onClick={saveEdit} disabled={saving} className="flex-1 bg-purple text-white font-heading font-semibold py-2 rounded-xl text-sm disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="font-body text-sm text-gray-500">
                        <p>ID: <span className="text-gray-800">{cat.id}</span></p>
                        <p>Descripci&oacute;n:<span className="text-gray-800">{cat.description}</span></p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(cat)} className="bg-purple/10 text-purple hover:bg-purple/20 font-heading font-semibold px-4 py-2 rounded-xl text-sm transition-colors">Editar</button>
                        {!ALL_CATEGORIES.includes(cat.id) && (
                          <button onClick={async () => {
                            if (!window.confirm(`¿Eliminar categoría "${cat.label}"?`)) return;
                            const existing = await fetchSetting<Array<{ id: string; label: string; icon: string; description: string }>>('custom_categories') || [];
                            await apiUpsertSetting('custom_categories', existing.filter(c => c.id !== cat.id));
                            const order = categories.filter(c => c.id !== cat.id).map(c => c.id);
                            await apiUpsertSetting('category_order', order);
                            setCategories(prev => prev.filter(c => c.id !== cat.id));
                            setExpandedCatId(null);
                            showToast('Categoría eliminada');
                          }} className="bg-red-50 text-red-500 hover:bg-red-100 font-heading font-semibold px-4 py-2 rounded-xl text-sm transition-colors">Eliminar</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WEBSITE TAB (CMS) ───
const WI_CLS = 'w-full border border-gray-200 rounded-lg py-2 px-3 font-body text-sm focus:border-purple focus:outline-none';

function revalidateSite() {
  fetch('/api/revalidate', {
    method: 'POST',
    headers: { 'x-admin-token': _adminToken },
  }).catch(() => {});
}

function WebsiteTab() {
  const { showToast } = useToast();
  const [section, setSection] = useState<'homepage' | 'featured' | 'areas' | 'logo' | 'faq'>('homepage');
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([]);

  useEffect(() => { fetchDBProducts().then(setDbProducts).catch(() => {}); }, []);

  // ─── A) HOMEPAGE ───
  const [hp, setHp] = useState({
    hero_title: '', hero_subtitle: '', hero_cta_primary: '', social_proof_text: '',
    services_title: '', services_subtitle: '', featured_title: '', featured_subtitle: '',
    cta_section_title: '', cta_section_subtitle: '',
  });
  const [hpLoaded, setHpLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<typeof hp>('homepage_content').then(d => {
      if (d) setHp(prev => ({ ...prev, ...d }));
      setHpLoaded(true);
    }).catch((e) => { console.error('Load homepage error:', e); setHpLoaded(true); });
  }, []);

  const saveHomepage = async () => {
    setSavingSection('homepage');
    try {
      const ok = await apiUpsertSetting('homepage_content', hp);
      if (!ok) { showToast('Error al guardar'); return; }
      revalidateSite();
      showToast('Homepage guardado');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── B) FEATURED ───
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [featLoaded, setFeatLoaded] = useState(false);
  const [cartSuggestIds, setCartSuggestIds] = useState<string[]>([]);
  const [checkoutSuggestIds, setCheckoutSuggestIds] = useState<string[]>([]);

  useEffect(() => {
    fetchSetting<string[]>('featured_products').then(d => {
      if (d) setFeaturedIds(d);
      setFeatLoaded(true);
    }).catch((e) => { console.error('Load featured error:', e); setFeatLoaded(true); });
    fetchSetting<string[]>('cart_suggestions').then(d => {
      if (Array.isArray(d)) setCartSuggestIds(d);
    }).catch((e) => console.error('Load cart suggestions error:', e));
    fetchSetting<string[]>('checkout_suggestions').then(d => {
      if (Array.isArray(d)) setCheckoutSuggestIds(d);
    }).catch((e) => console.error('Load checkout suggestions error:', e));
  }, []);

  const toggleFeatured = (id: string) => {
    setFeaturedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 6 ? [...prev, id] : prev);
  };

  const toggleCartSuggest = (id: string) => {
    setCartSuggestIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 6 ? [...prev, id] : prev);
  };

  const toggleCheckoutSuggest = (id: string) => {
    setCheckoutSuggestIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 6 ? [...prev, id] : prev);
  };

  const saveFeatured = async () => {
    setSavingSection('featured');
    try {
      const ok = (await apiUpsertSetting('featured_products', featuredIds))
        && (await apiUpsertSetting('cart_suggestions', cartSuggestIds))
        && (await apiUpsertSetting('checkout_suggestions', checkoutSuggestIds));
      if (!ok) { showToast('Error al guardar'); return; }
      revalidateSite();
      showToast('Productos destacados guardados');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── C) AREAS ───
  const [areas, setAreas] = useState<{ name: string; price: number }[]>([]);
  const [areasLoaded, setAreasLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<{ name: string; price: number }[]>('event_areas').then(d => {
      setAreas(d && d.length > 0 ? d : [...EVENT_AREAS]);
      setAreasLoaded(true);
    }).catch((e) => { console.error('Load areas error:', e); setAreas([...EVENT_AREAS]); setAreasLoaded(true); });
  }, []);

  const saveAreas = async () => {
    setSavingSection('areas');
    try {
      const clean = areas.filter(a => a.name.trim());
      const ok = await apiUpsertSetting('event_areas', clean);
      if (!ok) { showToast('Error al guardar'); return; }
      setAreas(clean);
      revalidateSite();
      showToast('\u00c1reas guardadas');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── CONTACT INFO ───
  const [contactInfo, setContactInfo] = useState({
    whatsapp: '50764332724',
    phone: '(+507) 6433-2724',
    email: 'playtimekidspty@gmail.com',
    instagram: '@playtimekids',
    bank_name: 'Banco Aliado',
    bank_holder: 'Nathalie Levy',
    bank_account_type: 'Cuenta Ahorros',
    bank_account_number: '1040071392',
  });
  const [contactLoaded, setContactLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<typeof contactInfo>('contact_info').then(d => {
      if (d) setContactInfo(prev => ({ ...prev, ...d }));
      setContactLoaded(true);
    }).catch(() => setContactLoaded(true));
  }, []);

  const saveContact = async () => {
    setSavingSection('contact');
    try {
      const ok = await apiUpsertSetting('contact_info', contactInfo);
      if (!ok) { showToast('Error al guardar'); return; }
      revalidateSite();
      showToast('Contacto guardado');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── E) LOGO ───
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    fetchSetting<string>('site_logo_url').then(u => { if (u) setLogoUrl(u); }).catch((e) => console.error('Load logo error:', e));
  }, []);

  const handleLogoUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { showToast('Foto muy grande. M\u00e1ximo 2MB'); return; }
    if (!file.type.startsWith('image/')) { showToast('Solo se permiten im\u00e1genes'); return; }
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', 'site-logo');
      formData.append('folder', 'logos');
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-token': _adminToken }, body: formData });
      if (res.ok) {
        const data = await res.json();
        const url = data.path + '?t=' + Date.now();
        const okSet = await apiUpsertSetting('site_logo_url', url);
        if (!okSet) { showToast('Logo subido pero no se guard\u00f3 en la base de datos'); return; }
        setLogoUrl(url);
        revalidateSite();
        showToast('Logo actualizado');
      } else {
        const errBody = await res.json().catch(() => null);
        showToast(errBody?.error || (res.status === 401 ? 'Sesi\u00f3n expirada \u2014 recarga la p\u00e1gina' : 'Error al subir logo'));
      }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setLogoUploading(false); }
  };

  const resetLogo = async () => {
    const ok = await apiUpsertSetting('site_logo_url', null);
    if (!ok) { showToast('Error al restaurar el logo'); return; }
    setLogoUrl(null);
    revalidateSite();
    showToast('Logo tipogr\u00e1fico restaurado');
  };

  // ─── F) TESTIMONIALS ───
  const [testimonials, setTestimonials] = useState<Array<{ name: string; text: string; avatar: string }>>([]);
  const [testimonialsLoaded, setTestimonialsLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<Array<{ name: string; text: string; avatar: string }>>('testimonials').then(d => {
      if (d && d.length > 0) {
        setTestimonials(d);
      } else {
        setTestimonials([
          { name: 'Marianela Rodr\u00edguez', text: 'Contrat\u00e9 el Plan #1 para el cumple de mi hija de 5 a\u00f1os y fue un \u00e9xito total. Las teachers fueron incre\u00edbles y los ni\u00f1os no pararon de re\u00edr.', avatar: '\uD83D\uDC69\u200D\uD83E\uDDB1' },
          { name: 'Sof\u00eda Arosemena', text: 'Ped\u00ed el gymboree y la m\u00e1quina de algod\u00f3n. Llegaron puntuales, montaron todo r\u00e1pido y los ni\u00f1os estaban felices.', avatar: '\uD83D\uDC69\u200D\uD83E\uDDB0' },
          { name: 'Patricia \u00c1brego', text: 'Me armaron un paquete a la medida. No tuve que preocuparme por nada, ellos trajeron todo hasta el sal\u00f3n.', avatar: '\uD83D\uDC71\u200D\u2640\uFE0F' },
          { name: 'Carmen Vergara', text: 'Ya es la segunda vez que los contrato. El show de t\u00edteres es espectacular, los ni\u00f1os quedaron hipnotizados.', avatar: '\uD83D\uDC69' },
        ]);
      }
      setTestimonialsLoaded(true);
    }).catch((e) => { console.error('Load testimonials error:', e); setTestimonialsLoaded(true); });
  }, []);

  const saveTestimonials = async () => {
    setSavingSection('testimonials');
    try {
      const clean = testimonials.filter(t => t.name.trim() && t.text.trim());
      const ok = await apiUpsertSetting('testimonials', clean);
      if (!ok) { showToast('Error al guardar'); return; }
      revalidateSite();
      showToast('Testimonios guardados');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── G-bis) TERMS & CONDITIONS ───
  const [terms, setTerms] = useState<Array<{ icon: string; title: string; text: string }>>([]);
  const [termsLoaded, setTermsLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<Array<{ icon: string; title: string; text: string }>>('terms_conditions').then(d => {
      if (d && d.length > 0) {
        setTerms(d);
      } else {
        setTerms([
          { icon: '\uD83D\uDCC5', title: 'Reserva', text: 'Para asegurar la fecha, se requiere un abono del 50% de la factura.' },
          { icon: '\uD83D\uDE9B', title: 'Entrega y recogida', text: 'Fines de semana: montamos el viernes, recogemos el lunes.\nEntre semana: montamos el d\u00eda del evento, recogemos al d\u00eda siguiente.\nEl espacio debe estar limpio y sin muebles al momento de la instalaci\u00f3n.' },
          { icon: '\u23F0', title: 'Duraci\u00f3n del servicio', text: 'El alquiler del equipo incluye 3 horas a partir de la hora indicada. Despu\u00e9s de ese tiempo, el personal se retira. Se puede extender con costo adicional por hora.' },
          { icon: '\uD83C\uDFB5', title: 'Servicios adicionales', text: 'M\u00fasica durante todo el evento y animaci\u00f3n de pi\u00f1ata est\u00e1n disponibles como servicios adicionales. Consulta precios.' },
          { icon: '\uD83D\uDCCB', title: 'Cambios y cancelaciones', text: 'Cambios de fecha o cancelaciones deben realizarse con m\u00ednimo 48 horas de anticipaci\u00f3n. Despu\u00e9s de ese plazo se cobra una penalidad de $50.' },
          { icon: '\u26A0\uFE0F', title: 'No reembolsable', text: 'Una vez el material sea transportado o instalado, no se realizan reembolsos por lluvia, fallas el\u00e9ctricas o falta de espacio.' },
          { icon: '\uD83D\uDCB3', title: 'M\u00e9todos de pago', text: 'Transferencia bancaria: Banco Aliado \u00b7 Nathalie Levy \u00b7 Cuenta Ahorros \u00b7 1040071392\nTarjeta de cr\u00e9dito: disponible con recargo del 5%' },
        ]);
      }
      setTermsLoaded(true);
    }).catch((e) => { console.error('Load terms error:', e); setTermsLoaded(true); });
  }, []);

  const saveTerms = async () => {
    setSavingSection('terms');
    try {
      const clean = terms.filter(t => t.title.trim() && t.text.trim());
      const ok = await apiUpsertSetting('terms_conditions', clean);
      if (!ok) { showToast('Error al guardar'); return; }
      revalidateSite();
      showToast('T\u00e9rminos guardados');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── G) SITE TEXTS ───
  const [siteTexts, setSiteTexts] = useState<SiteTexts>({ ...DEFAULT_SITE_TEXTS });
  const [siteTextsLoaded, setSiteTextsLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<Partial<SiteTexts>>('site_texts').then(d => {
      if (d) setSiteTexts(prev => ({ ...prev, ...d }));
      setSiteTextsLoaded(true);
    }).catch((e) => { console.error('Load site texts error:', e); setSiteTextsLoaded(true); });
  }, []);

  const saveSiteTexts = async () => {
    setSavingSection('textos');
    try {
      // Only save non-default values
      const overrides: Partial<SiteTexts> = {};
      for (const key of Object.keys(siteTexts) as (keyof SiteTexts)[]) {
        if (siteTexts[key] && siteTexts[key] !== DEFAULT_SITE_TEXTS[key]) {
          overrides[key] = siteTexts[key];
        }
      }
      const ok = await apiUpsertSetting('site_texts', overrides);
      if (!ok) { showToast('Error al guardar'); return; }
      clearSiteTextsCache();
      revalidateSite();
      showToast('Textos guardados');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── ABOUT ───
  const [aboutIntro, setAboutIntro] = useState('Somos un equipo apasionado por crear momentos inolvidables para los m\u00e1s peque\u00f1os. Desde 2015, hemos llevado alegr\u00eda a m\u00e1s de 600 eventos en Panam\u00e1, combinando creatividad, calidad y atenci\u00f3n al detalle en cada fiesta.');
  const [aboutStats, setAboutStats] = useState([
    { value: '+600', label: 'Eventos realizados' },
    { value: '+400', label: 'Familias felices' },
    { value: '8', label: 'Servicios disponibles' },
  ]);
  const [aboutLoaded, setAboutLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchSetting<string>('about_intro'),
      fetchSetting<{ value: string; label: string }[]>('about_stats'),
    ]).then(([intro, stats]) => {
      if (intro && typeof intro === 'string') setAboutIntro(intro);
      if (Array.isArray(stats) && stats.length > 0) setAboutStats(stats);
      setAboutLoaded(true);
    }).catch(() => setAboutLoaded(true));
  }, []);

  const saveAbout = async () => {
    setSavingSection('about');
    try {
      await apiUpsertSetting('about_intro', aboutIntro);
      await apiUpsertSetting('about_stats', aboutStats);
      revalidateSite();
      showToast('Nosotros guardado');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── FAQ ───
  const [faqItems, setFaqItems] = useState<{ q: string; a: string }[]>([]);
  const [faqLoaded, setFaqLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<{ q: string; a: string }[]>('faq_items').then(d => {
      if (Array.isArray(d) && d.length > 0) setFaqItems(d);
      else setFaqItems([
        { q: '\u00bfC\u00f3mo funciona el servicio?', a: 'Es muy sencillo: exploras nuestro cat\u00e1logo, eliges los servicios que m\u00e1s te gusten y nos escribes por WhatsApp para coordinar tu evento.' },
      ]);
      setFaqLoaded(true);
    }).catch(() => setFaqLoaded(true));
  }, []);

  const saveFaq = async () => {
    setSavingSection('faq');
    try {
      const clean = faqItems.filter(f => f.q.trim() && f.a.trim());
      await apiUpsertSetting('faq_items', clean);
      revalidateSite();
      showToast('FAQ guardadas');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  const SUB_TABS: { key: typeof section; label: string }[] = [
    { key: 'homepage', label: 'Textos' },
    { key: 'logo', label: 'Logo & Media' },
    { key: 'featured', label: 'Destacados' },
    { key: 'faq', label: 'FAQ' },
    { key: 'areas', label: 'Config' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="font-heading font-bold text-xl text-purple">Sitio Web</h2>

      {/* Sub-tabs — horizontal scroll, no wrap */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4" style={{ scrollSnapType: 'x mandatory' }}>
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSection(t.key)} className={`shrink-0 px-4 py-2 min-h-[36px] rounded-full font-heading font-semibold text-xs transition-all ${section === t.key ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} style={{ scrollSnapAlign: 'start' }}>{t.label}</button>
        ))}
      </div>

      {/* A) Homepage */}
      {section === 'homepage' && hpLoaded && (
        <div className="space-y-4">
          <p className="font-body text-gray-500 text-sm">Edita los textos del homepage. Deja vac&iacute;o para usar el valor por defecto.</p>
          {([
            ['hero_title', 'T\u00edtulo Hero (H1)', 'Fiestas que los ni\u00f1os nunca olvidan'],
            ['hero_subtitle', 'Subt\u00edtulo Hero', 'Animaci\u00f3n, alquiler y manualidades...'],
            ['hero_cta_primary', 'Bot\u00f3n Principal', 'Ver Cat\u00e1logo'],
            ['social_proof_text', 'Social Proof', '+200 fiestas realizadas \u00b7 Panam\u00e1'],
            ['services_title', 'T\u00edtulo Servicios', 'Nuestros Servicios'],
            ['services_subtitle', 'Subt\u00edtulo Servicios', 'Todo lo que necesitas...'],
            ['featured_title', 'T\u00edtulo Destacados', 'Los M&aacute;s Populares'],
            ['featured_subtitle', 'Subt\u00edtulo Destacados', 'Los favoritos de nuestros clientes'],
            ['cta_section_title', 'T\u00edtulo CTA', 'Haz tu reserva hoy'],
            ['cta_section_subtitle', 'Subt\u00edtulo CTA', 'Arma tu paquete ideal...'],
          ] as const).map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="block font-heading font-semibold text-xs text-gray-500 mb-1">{label}</label>
              <input value={hp[key]} onChange={e => setHp(prev => ({ ...prev, [key]: e.target.value }))} placeholder={placeholder} className={WI_CLS} />
            </div>
          ))}
          <button onClick={saveHomepage} disabled={savingSection === 'homepage'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'homepage' ? 'Guardando...' : 'Guardar Homepage'}</button>

          {/* Site texts merged here */}
          {siteTextsLoaded && (
            <>
              <div className="border-t border-gray-200 pt-4 mt-4">
                <p className="font-heading font-bold text-sm text-purple mb-3">Textos del carrito y checkout</p>
              </div>
              {(Object.keys(SITE_TEXT_LABELS) as (keyof SiteTexts)[]).map(key => (
                <div key={key}>
                  <label className="block font-heading font-semibold text-xs text-gray-500 mb-1">{SITE_TEXT_LABELS[key]}</label>
                  <input value={siteTexts[key] || ''} onChange={e => setSiteTexts(prev => ({ ...prev, [key]: e.target.value }))} placeholder={DEFAULT_SITE_TEXTS[key]} className={WI_CLS} />
                </div>
              ))}
              <button onClick={saveSiteTexts} disabled={savingSection === 'textos'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'textos' ? 'Guardando...' : 'Guardar Textos'}</button>
            </>
          )}

          {/* Nosotros — intro + stats */}
          {aboutLoaded && (
            <>
              <div className="border-t border-gray-200 pt-4 mt-4">
                <p className="font-heading font-bold text-sm text-purple mb-3">P\u00e1gina &ldquo;Nosotros&rdquo;</p>
              </div>
              <div>
                <label className="block font-heading font-semibold text-xs text-gray-500 mb-1">Texto de introducci\u00f3n</label>
                <textarea value={aboutIntro} onChange={e => setAboutIntro(e.target.value)} rows={3} className={`${WI_CLS} resize-none`} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {aboutStats.map((s, i) => (
                  <div key={i} className="space-y-1">
                    <input value={s.value} onChange={e => setAboutStats(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder="+600" className={WI_CLS} />
                    <input value={s.label} onChange={e => setAboutStats(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Eventos" className={WI_CLS} />
                  </div>
                ))}
              </div>
              <button onClick={saveAbout} disabled={savingSection === 'about'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'about' ? 'Guardando...' : 'Guardar Nosotros'}</button>
            </>
          )}
        </div>
      )}

      {/* E) Logo */}
      {section === 'logo' && (
        <div className="space-y-4">
          <p className="font-body text-gray-500 text-sm">Logo del sitio. Se muestra en el navbar y hero.</p>
          <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col items-center gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo actual" className="h-20 w-auto object-contain" />
            ) : (
              <div className="flex flex-col items-center leading-none py-2">
                <span className="font-heading font-black text-3xl text-teal tracking-tight leading-none">play</span>
                <span className="font-heading font-black text-3xl text-teal tracking-tight leading-none -mt-1">time</span>
                <span className="font-script text-sm text-purple">creando momentos.</span>
                <p className="font-body text-xs text-gray-400 mt-2">Logo tipogr&aacute;fico (por defecto)</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <label className={`flex-1 bg-purple text-white font-heading font-bold py-2.5 rounded-xl text-sm text-center cursor-pointer hover:bg-purple-light transition-colors ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {logoUploading ? 'Subiendo...' : 'Subir Logo'}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
            </label>
            {logoUrl && (
              <button onClick={resetLogo} className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">Usar logo tipogr&aacute;fico</button>
            )}
          </div>

        </div>
      )}

      {/* B) Featured Products */}
      {section === 'featured' && featLoaded && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <p className="font-body text-gray-500 text-sm">Selecciona hasta 6 productos para &ldquo;Los M&aacute;s Populares&rdquo;</p>
              <span className={`font-heading font-bold text-sm ${featuredIds.length >= 6 ? 'text-orange' : 'text-purple'}`}>{featuredIds.length}/6</span>
            </div>
            <div className="space-y-1 max-h-[320px] overflow-y-auto mt-2">
              {dbProducts.filter(p => p.active).map(p => {
                const checked = featuredIds.includes(p.id);
                const disabled = !checked && featuredIds.length >= 6;
                return (
                  <label key={p.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-teal/10' : 'hover:bg-gray-50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleFeatured(p.id)} className="w-4 h-4 accent-teal" />
                    <div className="flex-1 min-w-0">
                      <span className="font-heading font-semibold text-sm text-gray-800 truncate block">{p.name}</span>
                      <span className="font-body text-xs text-gray-400">{p.category} {'·'} {formatCurrency(p.price)}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-heading font-bold text-sm text-purple">&ldquo;Tambi&eacute;n piden con esto&rdquo; (carrito)</p>
                <p className="font-body text-gray-500 text-xs mt-0.5">Productos que aparecen en el carrito (hasta 6)</p>
              </div>
              <span className={`font-heading font-bold text-sm ${cartSuggestIds.length >= 6 ? 'text-orange' : 'text-purple'}`}>{cartSuggestIds.length}/6</span>
            </div>
            <div className="space-y-1 max-h-[320px] overflow-y-auto mt-2">
              {dbProducts.filter(p => p.active).map(p => {
                const checked = cartSuggestIds.includes(p.id);
                const disabled = !checked && cartSuggestIds.length >= 6;
                return (
                  <label key={p.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-orange/10' : 'hover:bg-gray-50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCartSuggest(p.id)} className="w-4 h-4 accent-orange" />
                    <div className="flex-1 min-w-0">
                      <span className="font-heading font-semibold text-sm text-gray-800 truncate block">{p.name}</span>
                      <span className="font-body text-xs text-gray-400">{p.category} {'·'} {formatCurrency(p.price)}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-heading font-bold text-sm text-purple">&ldquo;Antes de terminar&rdquo; (checkout)</p>
                <p className="font-body text-gray-500 text-xs mt-0.5">Upsells de \u00faltimo momento en el resumen del checkout (hasta 6)</p>
              </div>
              <span className={`font-heading font-bold text-sm ${checkoutSuggestIds.length >= 6 ? 'text-orange' : 'text-purple'}`}>{checkoutSuggestIds.length}/6</span>
            </div>
            <div className="space-y-1 max-h-[320px] overflow-y-auto mt-2">
              {dbProducts.filter(p => p.active).map(p => {
                const checked = checkoutSuggestIds.includes(p.id);
                const disabled = !checked && checkoutSuggestIds.length >= 6;
                return (
                  <label key={p.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-teal/10' : 'hover:bg-gray-50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCheckoutSuggest(p.id)} className="w-4 h-4 accent-teal" />
                    <div className="flex-1 min-w-0">
                      <span className="font-heading font-semibold text-sm text-gray-800 truncate block">{p.name}</span>
                      <span className="font-body text-xs text-gray-400">{p.category} {'·'} {formatCurrency(p.price)}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <button onClick={saveFeatured} disabled={savingSection === 'featured'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'featured' ? 'Guardando...' : 'Guardar cambios'}</button>
        </div>
      )}

      {/* FAQ Editor */}
      {section === 'faq' && faqLoaded && (
        <div className="space-y-3">
          <p className="font-body text-gray-500 text-sm">Preguntas frecuentes que aparecen en la p\u00e1gina /preguntas</p>
          {faqItems.map((item, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-heading font-bold text-xs text-gray-400">Pregunta {i + 1}</span>
                <button
                  onClick={() => setFaqItems(prev => prev.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  aria-label="Eliminar pregunta"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <input
                value={item.q}
                onChange={e => setFaqItems(prev => prev.map((p, j) => j === i ? { ...p, q: e.target.value } : p))}
                placeholder="\u00bfPregunta?"
                className={WI_CLS}
              />
              <textarea
                value={item.a}
                onChange={e => setFaqItems(prev => prev.map((p, j) => j === i ? { ...p, a: e.target.value } : p))}
                placeholder="Respuesta"
                rows={3}
                className={`${WI_CLS} resize-none`}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setFaqItems(prev => [...prev, { q: '', a: '' }])} className="bg-gray-100 text-gray-600 font-heading font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors">+ Agregar pregunta</button>
            <button onClick={saveFaq} disabled={savingSection === 'faq'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'faq' ? 'Guardando...' : 'Guardar FAQ'}</button>
          </div>
        </div>
      )}

      {/* C) Areas */}
      {section === 'areas' && areasLoaded && (
        <div className="space-y-6">
          {/* Contact info */}
          {contactLoaded && (
            <div className="space-y-3">
              <p className="font-heading font-bold text-sm text-purple">Datos de contacto</p>
              <p className="font-body text-gray-500 text-xs -mt-2">Se usan en footer, hero, WhatsApp y datos bancarios</p>
              <div className="grid grid-cols-2 gap-2">
                <input value={contactInfo.whatsapp} onChange={e => setContactInfo({ ...contactInfo, whatsapp: e.target.value })} placeholder="WhatsApp (50764332724)" className={WI_CLS} />
                <input value={contactInfo.phone} onChange={e => setContactInfo({ ...contactInfo, phone: e.target.value })} placeholder="Tel\u00e9fono" className={WI_CLS} />
                <input value={contactInfo.email} onChange={e => setContactInfo({ ...contactInfo, email: e.target.value })} placeholder="Email" className={WI_CLS} />
                <input value={contactInfo.instagram} onChange={e => setContactInfo({ ...contactInfo, instagram: e.target.value })} placeholder="@instagram" className={WI_CLS} />
              </div>
              <p className="font-heading font-bold text-sm text-purple pt-2">Datos bancarios</p>
              <div className="grid grid-cols-2 gap-2">
                <input value={contactInfo.bank_name} onChange={e => setContactInfo({ ...contactInfo, bank_name: e.target.value })} placeholder="Banco" className={WI_CLS} />
                <input value={contactInfo.bank_holder} onChange={e => setContactInfo({ ...contactInfo, bank_holder: e.target.value })} placeholder="Titular" className={WI_CLS} />
                <input value={contactInfo.bank_account_type} onChange={e => setContactInfo({ ...contactInfo, bank_account_type: e.target.value })} placeholder="Tipo de cuenta" className={WI_CLS} />
                <input value={contactInfo.bank_account_number} onChange={e => setContactInfo({ ...contactInfo, bank_account_number: e.target.value })} placeholder="N\u00famero de cuenta" className={WI_CLS} />
              </div>
              <button onClick={saveContact} disabled={savingSection === 'contact'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'contact' ? 'Guardando...' : 'Guardar contacto'}</button>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <p className="font-body text-gray-500 text-sm">&Aacute;reas de cobertura con precio de transporte</p>
          </div>
          <div className="space-y-2">
            {areas.map((area, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={area.name} onChange={e => setAreas(prev => prev.map((a, j) => j === i ? { ...a, name: e.target.value } : a))} placeholder="Nombre del \u00e1rea" className={`flex-1 ${WI_CLS}`} />
                <div className="flex items-center gap-1">
                  <span className="font-body text-sm text-gray-400">$</span>
                  <input type="number" value={area.price} onChange={e => setAreas(prev => prev.map((a, j) => j === i ? { ...a, price: Number(e.target.value) || 0 } : a))} className={`w-20 ${WI_CLS}`} min="0" />
                </div>
                <button onClick={() => { if (window.confirm(`¿Eliminar el área "${area.name || 'sin nombre'}"?`)) setAreas(prev => prev.filter((_, j) => j !== i)); }} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAreas(prev => [...prev, { name: '', price: 0 }])} className="bg-gray-100 text-gray-600 font-heading font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors">+ Agregar &aacute;rea</button>
            <button onClick={saveAreas} disabled={savingSection === 'areas'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'areas' ? 'Guardando...' : 'Guardar &Aacute;reas'}</button>
          </div>

          {/* Testimonials merged here */}
          {testimonialsLoaded && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="font-heading font-bold text-sm text-purple mb-3">Testimonios</p>
              <p className="font-body text-gray-500 text-xs mb-3">Testimonios que aparecen en la p{'á'}gina principal (m{'á'}x 6)</p>
              {testimonials.map((t, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 space-y-2 mb-2">
                  <div className="flex items-center gap-2">
                    <input value={t.avatar} onChange={e => setTestimonials(prev => prev.map((item, j) => j === i ? { ...item, avatar: e.target.value } : item))} placeholder="Avatar" maxLength={4} className="w-12 border border-gray-200 rounded-lg py-1 px-2 font-body text-center text-lg focus:border-purple focus:outline-none" />
                    <input value={t.name} onChange={e => setTestimonials(prev => prev.map((item, j) => j === i ? { ...item, name: e.target.value } : item))} placeholder="Nombre" className={`flex-1 ${WI_CLS}`} />
                    {testimonials.length > 1 && (
                      <button onClick={() => setTestimonials(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 transition-colors p-1">{'✕'}</button>
                    )}
                  </div>
                  <textarea value={t.text} onChange={e => setTestimonials(prev => prev.map((item, j) => j === i ? { ...item, text: e.target.value } : item))} placeholder="Texto del testimonio..." rows={2} className={WI_CLS} />
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={() => setTestimonials(prev => prev.length < 6 ? [...prev, { name: '', text: '', avatar: '' }] : prev)} disabled={testimonials.length >= 6} className="bg-gray-100 text-gray-600 font-heading font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors disabled:opacity-40">+ Agregar</button>
                <button onClick={saveTestimonials} disabled={savingSection === 'testimonials'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'testimonials' ? 'Guardando...' : 'Guardar Testimonios'}</button>
              </div>
            </div>
          )}
          {/* Terms & Conditions */}
          {termsLoaded && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="font-heading font-bold text-sm text-purple mb-3">T{'é'}rminos y Condiciones</p>
              <p className="font-body text-gray-500 text-xs mb-3">Secciones que aparecen en la p{'á'}gina de t{'é'}rminos y en la confirmaci{'ó'}n</p>
              {terms.map((t, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-3 space-y-2 mb-2">
                  <div className="flex items-center gap-2">
                    <input value={t.icon} onChange={e => setTerms(prev => prev.map((item, j) => j === i ? { ...item, icon: e.target.value } : item))} placeholder="Emoji" maxLength={4} className="w-12 border border-gray-200 rounded-lg py-1 px-2 font-body text-center text-lg focus:border-purple focus:outline-none" />
                    <input value={t.title} onChange={e => setTerms(prev => prev.map((item, j) => j === i ? { ...item, title: e.target.value } : item))} placeholder="T&iacute;tulo" className={`flex-1 ${WI_CLS}`} />
                    {terms.length > 1 && (
                      <button onClick={() => { if (confirm('¿Eliminar esta sección?')) setTerms(prev => prev.filter((_, j) => j !== i)); }} className="text-gray-400 hover:text-red-500 transition-colors p-1">{'✕'}</button>
                    )}
                  </div>
                  <textarea value={t.text} onChange={e => setTerms(prev => prev.map((item, j) => j === i ? { ...item, text: e.target.value } : item))} placeholder="Texto de la sección (usa Enter para saltos de línea)..." rows={3} className={WI_CLS} />
                  <div className="flex gap-1">
                    {i > 0 && (
                      <button onClick={() => setTerms(prev => { const n = [...prev]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} className="text-gray-400 hover:text-purple transition-colors p-1 text-xs font-heading">{'▲'}</button>
                    )}
                    {i < terms.length - 1 && (
                      <button onClick={() => setTerms(prev => { const n = [...prev]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; })} className="text-gray-400 hover:text-purple transition-colors p-1 text-xs font-heading">{'▼'}</button>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={() => setTerms(prev => [...prev, { icon: '', title: '', text: '' }])} className="bg-gray-100 text-gray-600 font-heading font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors">+ Agregar secci{'ó'}n</button>
                <button onClick={saveTerms} disabled={savingSection === 'terms'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'terms' ? 'Guardando...' : 'Guardar T\u00e9rminos'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Standalone reels/testimonials/textos sections removed — merged into Logo & Config */}
    </div>
  );
}

// ─── CATÁLOGO ADMIN TAB (merges Products + Categories) ───
function CatalogoAdminTab() {
  const [subTab, setSubTab] = useState<'productos' | 'categorias'>('productos');
  return (
    <div>
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-5">
        <button onClick={() => setSubTab('productos')} className={`flex-1 py-1.5 rounded-md font-heading font-semibold text-xs transition-all ${subTab === 'productos' ? 'bg-white text-purple shadow-sm' : 'text-gray-500'}`}>Productos</button>
        <button onClick={() => setSubTab('categorias')} className={`flex-1 py-1.5 rounded-md font-heading font-semibold text-xs transition-all ${subTab === 'categorias' ? 'bg-white text-purple shadow-sm' : 'text-gray-500'}`}>Categor&iacute;as</button>
      </div>
      {subTab === 'productos' ? <ProductsTab /> : <CatalogTab />}
    </div>
  );
}

// ─── MAIN ADMIN PAGE ───

export default function AdminPage() {
  const { showToast } = useToast();
  const [pin, setPin] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'pedidos' | 'website' | 'catalogo'>('pedidos');
  const [pushEnabled, setPushEnabled] = useState(false);

  // Restore session from sessionStorage on mount
  useEffect(() => {
    try {
      const savedToken = sessionStorage.getItem('adminToken');
      const savedRole = sessionStorage.getItem('adminRole');
      if (savedToken) {
        _adminToken = savedToken;
        _adminRole = (savedRole === 'vendedora' ? 'vendedora' : 'admin');
        setAuthenticated(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setPushEnabled(!!sub);
        });
      });
    }
  }, []);

  const togglePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        showToast('Notificaciones desactivadas');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });
        await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
        setPushEnabled(true);
        showToast('Notificaciones activadas');
      }
    } catch (err) {
      console.error('Push toggle error:', err);
      showToast('Error al activar notificaciones');
    }
  };
  void togglePush;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.ok) {
        _adminToken = data.token || '';
        _adminRole = data.role || 'admin';
        try {
          sessionStorage.setItem('adminToken', _adminToken);
          sessionStorage.setItem('adminRole', _adminRole);
        } catch {}
        setAuthenticated(true);
      } else {
        setError(data.error || 'PIN incorrecto');
      }
    } catch {
      setError('Error de conexión');
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream px-4">
        <form onSubmit={handleLogin} className="bg-white rounded-3xl p-8 shadow-lg max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-purple/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="font-heading font-bold text-2xl text-purple">Admin</h1>
            <p className="font-body text-gray-500 text-sm mt-1">Ingresa el PIN</p>
          </div>

          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(''); }}
            placeholder="PIN de 4 dígitos"
            className="w-full text-center text-2xl tracking-[0.5em] font-heading font-bold border-2 border-gray-200 rounded-xl py-3 px-4 focus:border-purple focus:outline-none mb-4"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm text-center mb-3 font-body">{error}</p>}
          <button type="submit" className="w-full bg-purple text-white font-heading font-bold py-3 rounded-xl hover:bg-purple-light transition-colors">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Clean tab bar — vendedora only sees Pedidos */}
      {_adminRole === 'admin' && (
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
          {([['pedidos', 'Pedidos'], ['catalogo', 'Cat\u00e1logo'], ['website', 'Sitio']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg font-heading font-semibold text-xs transition-all ${
                tab === t ? 'bg-white text-purple shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {_adminRole === 'admin' && (
        <Link
          href="/admin/contabilidad"
          className="flex items-center justify-center gap-2 mb-6 py-2.5 rounded-xl bg-purple/10 text-purple font-heading font-semibold text-sm hover:bg-purple/20 transition-colors"
        >
          <span>💰</span> Contabilidad
        </Link>
      )}

      {tab === 'pedidos' && <OrdersTab />}
      {_adminRole === 'admin' && tab === 'catalogo' && <CatalogoAdminTab />}
      {_adminRole === 'admin' && tab === 'website' && <WebsiteTab />}
    </div>
  );
}
