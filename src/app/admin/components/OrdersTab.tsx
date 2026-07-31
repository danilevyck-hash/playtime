'use client';

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { canonicalStatus } from "@/lib/order-status";
import { panamaToday } from "@/lib/timezone";
import { useToast } from "@/context/ToastContext";
import { ORDER_STATUSES, STATUS_HEX, getInitials, fmtTime12h, _adminToken, _adminRole, RETURN_TO_LIST_KEY, type Order } from "./shared";

export default function OrdersTab() {
  const { showToast } = useToast();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'realizado' | 'rejected' | 'archived'>('all');
  const [eventMonthFilter, setEventMonthFilter] = useState<string>('all'); // 'all' or 'YYYY-MM'
  const [sortMode, setSortMode] = useState<'created' | 'event'>('event');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    counts: { pendiente: number; confirmado: number; realizado: number; rechazado: number };
    confirmedRevenue: number;
    archived: number;
    months: { key: string; label: string }[];
  } | null>(null);

  const PAGE_SIZE = 100;
  // Server-side filters: search / status / month go to the API (so orders older than
  // the first page are still findable). Returns to offset 0 whenever a filter changes.
  const buildParams = useCallback((offset: number) => {
    const p = new URLSearchParams();
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(offset));
    if (search.trim()) p.set('q', search.trim());
    if (statusFilter === 'archived') p.set('deleted', 'true');
    else if (statusFilter !== 'all') p.set('status', statusFilter);
    if (eventMonthFilter !== 'all') p.set('month', eventMonthFilter);
    return p;
  }, [search, statusFilter, eventMonthFilter]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/orders?${buildParams(0).toString()}`, { headers: { 'x-admin-token': _adminToken } });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total ?? (data.orders?.length || 0));
      setHasMore(!!data.hasMore);
      if (data.message) setError(data.message);
    } catch {
      setError('No se pudieron cargar los pedidos. Verifica que Supabase est\u00e9 configurado.');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/orders?${buildParams(orders.length).toString()}`, { headers: { 'x-admin-token': _adminToken } });
      if (res.ok) {
        const data = await res.json();
        setOrders(prev => [...prev, ...(data.orders || [])]);
        setTotal(data.total ?? orders.length);
        setHasMore(!!data.hasMore);
      }
    } catch {} finally {
      setLoadingMore(false);
    }
  }, [buildParams, orders.length]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/orders/stats', { headers: { 'x-admin-token': _adminToken } });
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  // Debounced refetch when search/status/month change (fetchOrders identity tracks them).
  useEffect(() => {
    const t = setTimeout(() => { fetchOrders(); }, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetchOrders, search]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  const exportCSV = async () => {
    // Export ALL orders matching the current filter (not just the loaded page).
    const all: Order[] = [];
    for (let off = 0; off < 100000; off += 100) {
      const p = buildParams(off); p.set('limit', '100'); p.set('offset', String(off));
      const res = await fetch(`/api/orders?${p.toString()}`, { headers: { 'x-admin-token': _adminToken } });
      if (!res.ok) break;
      const data = await res.json();
      const batch: Order[] = data.orders || [];
      all.push(...batch);
      if (!data.hasMore || batch.length === 0) break;
    }
    const headers = ['#Pedido','Cliente','Tel\u00e9fono','Email','Fecha Evento','Hora','\u00c1rea','Direcci\u00f3n','Cumplea\u00f1ero','Edad','Tema','M\u00e9todo Pago','Subtotal','Transporte','Recargo','Total','Dep\u00f3sito','Saldo Pendiente','Estado','Nota Interna','Fecha Creaci\u00f3n'];
    const esc = (v: string | number | null | undefined) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = all.map(o => {
      const dep = o.deposit_amount ?? 0;
      const theme = o.notes?.replace(/^Tema:\s*/, '') || '';
      return [o.order_number, o.customer_name, o.customer_phone, o.customer_email, o.event_date, o.event_time, o.event_area, o.event_address, o.birthday_child_name, o.birthday_child_age, theme, o.payment_method === 'bank_transfer' ? 'Transferencia' : 'Tarjeta', o.subtotal, o.transport_cost_confirmed ?? '', o.surcharge, o.total, dep, dep > 0 ? o.total - dep : '', canonicalStatus(o), o.internal_note, o.created_at].map(esc).join(',');
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'playtime-pedidos.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Filtering (search/status/month) is server-side now; here we only sort the loaded
  // page for display: upcoming events first (asc), past events at the bottom (reverse).
  const filteredOrders = useMemo(() => {
    const today = panamaToday();
    return [...orders].sort((a, b) => {
      const aFuture = (a.event_date || '') >= today;
      const bFuture = (b.event_date || '') >= today;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return (a.event_date || '').localeCompare(b.event_date || '');
      return (b.event_date || '').localeCompare(a.event_date || '');
    });
  }, [orders]);

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

  // Months + stats come from the server (aggregated over ALL orders), so they stay
  // correct regardless of how many pages are loaded.
  const eventMonthOptions = stats?.months || [];
  const totalOrders = stats?.total ?? 0;
  const pendingOrders = stats?.counts.pendiente ?? 0;
  const confirmedOrders = stats?.counts.confirmado ?? 0;
  const realizadoOrders = stats?.counts.realizado ?? 0;
  const rejectedOrders = stats?.counts.rechazado ?? 0;
  const confirmedRevenue = stats?.confirmedRevenue ?? 0;
  const archivedOrders = stats?.archived ?? 0;

  // Marca que el detalle se abrió DESDE el listado. El detalle lo lee para
  // decidir si "← Pedidos" puede usar history.back() (que conserva la posición
  // del scroll) o si tiene que navegar a /admin porque se entró directo por URL
  // y atrás no hay listado al que volver.
  const goToOrder = (id: number) => {
    try { sessionStorage.setItem(RETURN_TO_LIST_KEY, '1'); } catch {}
    router.push(`/admin/pedidos/${id}`);
  };

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
          ['archived', `Archivados (${archivedOrders})`],
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
                const st = canonicalStatus(o);
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
            const st = canonicalStatus(o);
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

      {/* ─── LOAD MORE ─── */}
      {!loading && hasMore && (
        <div className="text-center mt-5">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 rounded-xl font-heading font-semibold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Cargando…' : `Cargar más (${Math.max(0, total - orders.length)} restantes)`}
          </button>
        </div>
      )}

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
                    onClick={async () => { await exportCSV(); showToast('CSV descargado'); }}
                    className="flex-1 py-3 rounded-xl font-heading font-semibold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Exportar CSV
                  </button>
                  <button
                    onClick={() => { fetchOrders(); fetchStats(); }}
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

