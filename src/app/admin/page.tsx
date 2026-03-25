'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatCurrency } from '@/lib/format';
import { EVENT_AREAS } from '@/lib/types';
import {
  fetchProductOverrides,
  fetchAllCustomProducts,
  upsertProductOverride,
  upsertCustomProduct,
  deleteCustomProduct,
  fetchSetting,
  upsertSetting,
} from '@/lib/supabase-data';
import { PRODUCTS } from '@/lib/constants';

type OrderStatus = 'nuevo' | 'confirmado' | 'deposito' | 'realizado';
const ORDER_STATUSES: { key: OrderStatus; label: string; color: string; bg: string }[] = [
  { key: 'nuevo', label: 'Nuevo', color: 'text-gray-600', bg: 'bg-gray-200' },
  { key: 'confirmado', label: 'Confirmado', color: 'text-teal', bg: 'bg-teal' },
  { key: 'deposito', label: 'Dep\u00f3sito', color: 'text-orange', bg: 'bg-orange' },
  { key: 'realizado', label: 'Realizado', color: 'text-purple', bg: 'bg-purple' },
];

interface OrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
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
  transport_cost_confirmed: number | null;
  created_at: string;
  confirmed: boolean;
  items: OrderItem[];
}

function getOrderStatus(order: Order): OrderStatus {
  if (order.status) return order.status;
  return order.confirmed ? 'confirmado' : 'nuevo';
}

const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || '';

function extractReelId(url: string): string | null {
  const match = url.match(/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

// ─── REELS TAB ───
function ReelsTab() {
  const [reelUrls, setReelUrls] = useState(['', '', '']);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const reels = await fetchSetting<Array<{ url: string; id: string }>>('reels');
        if (!cancelled && reels && reels.length > 0) {
          const urls = reels.map((r) => r.url);
          setReelUrls([urls[0] || '', urls[1] || '', urls[2] || '']);
          return;
        }
      } catch {}
      // Fallback to localStorage
      if (!cancelled) {
        try {
          const data = localStorage.getItem('playtime_reels');
          if (data) {
            const reels = JSON.parse(data);
            const urls = reels.map((r: { url: string }) => r.url);
            setReelUrls([urls[0] || '', urls[1] || '', urls[2] || '']);
          }
        } catch {}
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    const reels = reelUrls
      .filter(Boolean)
      .map((url) => {
        const id = extractReelId(url);
        return id ? { url, id } : null;
      })
      .filter(Boolean);

    // Save to Supabase
    const ok = await upsertSetting('reels', reels);

    // Also save to localStorage as fallback
    try { localStorage.setItem('playtime_reels', JSON.stringify(reels)); } catch {}

    if (!ok) console.error('Failed to save reels to Supabase');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-xl text-purple mb-1">Instagram Reels</h2>
        <p className="font-body text-gray-500 text-sm">Pega los links de los 3 reels que quieres mostrar en la página principal</p>
      </div>
      {reelUrls.map((url, i) => (
        <div key={i}>
          <label className="block font-heading font-semibold text-sm text-gray-600 mb-1">Reel {i + 1}</label>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              const updated = [...reelUrls];
              updated[i] = e.target.value;
              setReelUrls(updated);
            }}
            placeholder="https://www.instagram.com/reel/ABC123..."
            className="w-full border-2 border-gray-200 rounded-xl py-2.5 px-3 font-body text-sm focus:border-purple focus:outline-none"
          />
          {url && extractReelId(url) && (
            <p className="text-xs text-teal mt-1 font-body">ID detectado: {extractReelId(url)}</p>
          )}
        </div>
      ))}
      <button
        onClick={handleSave}
        className={`px-6 py-2.5 rounded-xl font-heading font-bold text-white transition-colors ${saved ? 'bg-teal' : 'bg-purple hover:bg-purple-light'}`}
      >
        {saved ? 'Guardado' : 'Guardar Reels'}
      </button>
    </div>
  );
}

// ─── ORDERS TAB ───
const OI_CLS = 'w-full border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none';

function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed'>('all');
  const [sortMode, setSortMode] = useState<'created' | 'event'>('created');
  const [noteInputs, setNoteInputs] = useState<Record<number, string>>({});
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [editOrderForm, setEditOrderForm] = useState<Record<string, string>>({});
  const [depositInputs, setDepositInputs] = useState<Record<number, string>>({});
  const [transportInputs, setTransportInputs] = useState<Record<number, string>>({});

  const patchOrder = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN },
      body: JSON.stringify(body),
    });
    return res.ok;
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/orders', { headers: { 'x-admin-pin': ADMIN_PIN } });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setOrders(data.orders || []);
      if (data.message) setError(data.message);
    } catch {
      setError('No se pudieron cargar los pedidos. Verifica que Supabase esté configurado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const setOrderStatus = async (orderId: number, newStatus: OrderStatus) => {
    const confirmed = newStatus !== 'nuevo';
    if (await patchOrder({ orderId, status: newStatus })) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus, confirmed } : o));
    }
  };

  const deleteOrder = async (orderId: number, orderNumber: number) => {
    if (!window.confirm(`\u00bfEliminar pedido #${orderNumber}? Esta acci\u00f3n no se puede deshacer.`)) return;
    try {
      const res = await fetch('/api/orders', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN }, body: JSON.stringify({ orderId }) });
      if (res.ok) { setOrders(prev => prev.filter(o => o.id !== orderId)); setExpandedOrder(null); }
    } catch {}
  };

  const saveNote = async (orderId: number) => {
    const text = (noteInputs[orderId] || '').trim();
    if (!text) return;
    if (await patchOrder({ orderId, internalNote: text })) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, internal_note: text } : o));
      setNoteInputs(prev => ({ ...prev, [orderId]: '' }));
    }
  };

  const startEditOrder = (o: Order) => {
    setEditingOrderId(o.id);
    setEditOrderForm({
      customer_name: o.customer_name, customer_phone: o.customer_phone, customer_email: o.customer_email || '',
      event_date: o.event_date, event_time: o.event_time, event_area: o.event_area || '', event_address: o.event_address,
      birthday_child_name: o.birthday_child_name || '', birthday_child_age: o.birthday_child_age ? String(o.birthday_child_age) : '',
      notes: o.notes || '',
    });
  };

  const saveEditOrder = async (orderId: number) => {
    const f = editOrderForm;
    const editFields = {
      customer_name: f.customer_name, customer_phone: f.customer_phone, customer_email: f.customer_email,
      event_date: f.event_date, event_time: f.event_time, event_area: f.event_area, event_address: f.event_address,
      birthday_child_name: f.birthday_child_name, birthday_child_age: f.birthday_child_age ? Number(f.birthday_child_age) : null,
      notes: f.notes,
    };
    if (await patchOrder({ orderId, editFields })) {
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o, customer_name: f.customer_name, customer_phone: f.customer_phone, customer_email: f.customer_email || null,
        event_date: f.event_date, event_time: f.event_time, event_area: f.event_area || null, event_address: f.event_address,
        birthday_child_name: f.birthday_child_name || null, birthday_child_age: f.birthday_child_age ? Number(f.birthday_child_age) : null,
        notes: f.notes || null,
      } : o));
      setEditingOrderId(null);
    }
  };

  const saveDeposit = async (orderId: number) => {
    const val = Number(depositInputs[orderId]);
    if (isNaN(val) || val < 0) return;
    if (await patchOrder({ orderId, depositAmount: val })) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, deposit_amount: val } : o));
      setDepositInputs(prev => ({ ...prev, [orderId]: '' }));
    }
  };

  const saveTransport = async (orderId: number) => {
    const val = Number(transportInputs[orderId]);
    if (isNaN(val) || val < 0) return;
    if (await patchOrder({ orderId, transportCostConfirmed: val })) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, transport_cost_confirmed: val } : o));
      setTransportInputs(prev => ({ ...prev, [orderId]: '' }));
    }
  };

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

  // Filter orders by search + status
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (statusFilter === 'confirmed') result = result.filter(o => o.confirmed);
    else if (statusFilter === 'pending') result = result.filter(o => !o.confirmed);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(o =>
        o.customer_name.toLowerCase().includes(q) || o.event_date.includes(q) ||
        String(o.order_number).includes(q) || (o.customer_phone && o.customer_phone.includes(q))
      );
    }
    return result;
  }, [orders, search, statusFilter]);

  // Group by event date for "by event" view
  const groupedByEvent = useMemo(() => {
    if (sortMode !== 'event') return null;
    const sorted = [...filteredOrders].sort((a, b) => a.event_date.localeCompare(b.event_date));
    const groups: { date: string; label: string; orders: Order[] }[] = [];
    for (const o of sorted) {
      const last = groups[groups.length - 1];
      if (last && last.date === o.event_date) { last.orders.push(o); } else {
        const d = new Date(o.event_date + 'T00:00:00');
        const DIAS = ['Domingo', 'Lunes', 'Martes', 'Mi\u00e9rcoles', 'Jueves', 'Viernes', 'S\u00e1bado'];
        const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        groups.push({ date: o.event_date, label: `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`, orders: [o] });
      }
    }
    return groups;
  }, [filteredOrders, sortMode]);

  // Monthly summary
  const monthlySummary = useMemo(() => {
    const months: Record<string, { total: number; confirmed: number; count: number; confirmedCount: number }> = {};
    for (const o of orders) {
      const date = new Date(o.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!months[key]) months[key] = { total: 0, confirmed: 0, count: 0, confirmedCount: 0 };
      months[key].total += o.total;
      months[key].count += 1;
      if (o.confirmed) {
        months[key].confirmed += o.total;
        months[key].confirmedCount += 1;
      }
    }
    return Object.entries(months)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, data]) => {
        const [y, m] = month.split('-');
        const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return { label: `${MESES[Number(m) - 1]} ${y}`, ...data };
      });
  }, [orders]);

  const totalOrders = orders.length;
  const confirmedOrders = orders.filter(o => o.confirmed).length;
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const confirmedRevenue = orders.filter(o => o.confirmed).reduce((s, o) => s + o.total, 0);

  const renderOrderCard = (order: Order) => {
    const st = getOrderStatus(order);
    const stInfo = ORDER_STATUSES.find(s => s.key === st) || ORDER_STATUSES[0];
    const isEditing = editingOrderId === order.id;
    const ef = editOrderForm;
    const needsTransport = order.event_area === 'Otra \u00e1rea' || order.transport_cost_confirmed === null;
    const dep = order.deposit_amount ?? 0;

    return (
      <div key={order.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${st === 'nuevo' ? 'border-gray-100' : st === 'confirmado' ? 'border-teal/30' : st === 'deposito' ? 'border-orange/30' : 'border-purple/30'}`}>
        <button onClick={() => { setExpandedOrder(expandedOrder === order.id ? null : order.id); if (editingOrderId === order.id) setEditingOrderId(null); }} className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-heading font-semibold px-2 py-0.5 rounded-full text-white ${stInfo.bg}`}>{stInfo.label}</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-heading font-bold text-purple">#{order.order_number}</span>
                  <span className={`text-xs font-heading font-semibold px-2 py-0.5 rounded-full ${order.payment_method === 'bank_transfer' ? 'bg-teal/10 text-teal' : 'bg-orange/10 text-orange'}`}>
                    {order.payment_method === 'bank_transfer' ? 'Transferencia' : 'Tarjeta'}
                  </span>
                </div>
                <p className="font-body text-gray-700 text-sm mt-0.5">{order.customer_name} \u00b7 {order.event_date}</p>
              </div>
            </div>
            <span className="font-heading font-bold text-lg text-purple">{formatCurrency(order.total)}</span>
          </div>
        </button>
        {expandedOrder === order.id && (
          <div className="border-t border-gray-100 p-4 bg-gray-50/50 space-y-3">
            {/* Pipeline */}
            <div className="flex gap-1">
              {ORDER_STATUSES.map(s => (
                <button key={s.key} onClick={() => setOrderStatus(order.id, s.key)}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-heading font-semibold transition-all ${st === s.key ? `${s.bg} text-white` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >{s.label}</button>
              ))}
            </div>

            {/* Details or edit form */}
            {isEditing ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input value={ef.customer_name || ''} onChange={e => setEditOrderForm(p => ({ ...p, customer_name: e.target.value }))} placeholder="Nombre" className={OI_CLS} />
                  <input value={ef.customer_phone || ''} onChange={e => setEditOrderForm(p => ({ ...p, customer_phone: e.target.value }))} placeholder="Tel\u00e9fono" className={OI_CLS} />
                </div>
                <input value={ef.customer_email || ''} onChange={e => setEditOrderForm(p => ({ ...p, customer_email: e.target.value }))} placeholder="Email" className={OI_CLS} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={ef.event_date || ''} onChange={e => setEditOrderForm(p => ({ ...p, event_date: e.target.value }))} className={OI_CLS} />
                  <input type="time" value={ef.event_time || ''} onChange={e => setEditOrderForm(p => ({ ...p, event_time: e.target.value }))} className={OI_CLS} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={ef.event_area || ''} onChange={e => setEditOrderForm(p => ({ ...p, event_area: e.target.value }))} className={OI_CLS}>
                    <option value="">\u00c1rea</option>
                    {EVENT_AREAS.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                  </select>
                  <input value={ef.event_address || ''} onChange={e => setEditOrderForm(p => ({ ...p, event_address: e.target.value }))} placeholder="Direcci\u00f3n" className={OI_CLS} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input value={ef.birthday_child_name || ''} onChange={e => setEditOrderForm(p => ({ ...p, birthday_child_name: e.target.value }))} placeholder="Cumplea\u00f1ero" className={OI_CLS} />
                  <input type="number" value={ef.birthday_child_age || ''} onChange={e => setEditOrderForm(p => ({ ...p, birthday_child_age: e.target.value }))} placeholder="Edad" className={OI_CLS} />
                  <input value={ef.notes || ''} onChange={e => setEditOrderForm(p => ({ ...p, notes: e.target.value }))} placeholder="Tema/Notas" className={OI_CLS} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingOrderId(null)} className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-2 rounded-xl text-sm">Cancelar</button>
                  <button onClick={() => saveEditOrder(order.id)} className="flex-1 bg-purple text-white font-heading font-semibold py-2 rounded-xl text-sm">Guardar cambios</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-400 font-heading text-xs uppercase">Tel</span><br/><a href={`tel:${order.customer_phone}`} className="text-teal">{order.customer_phone}</a></div>
                <div><span className="text-gray-400 font-heading text-xs uppercase">Hora</span><br/>{order.event_time}</div>
                {order.event_area && <div><span className="text-gray-400 font-heading text-xs uppercase">\u00c1rea</span><br/>{order.event_area}</div>}
                <div className="col-span-2"><span className="text-gray-400 font-heading text-xs uppercase">Lugar</span><br/>{order.event_address}</div>
                {order.birthday_child_name && <div className="col-span-2"><span className="text-gray-400 font-heading text-xs uppercase">Cumplea\u00f1ero/a</span><br/>{order.birthday_child_name}{order.birthday_child_age ? ` (${order.birthday_child_age} a\u00f1os)` : ''}</div>}
                {order.notes && <div className="col-span-2"><span className="text-gray-400 font-heading text-xs uppercase">Notas</span><br/>{order.notes}</div>}
              </div>
            )}

            {/* Items */}
            {order.items.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between px-3 py-2 text-sm">
                    <span>{item.product_name} <span className="text-gray-400">x{item.quantity}</span></span>
                    <span className="font-semibold">{formatCurrency(item.line_total)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <a href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-[#25D366] text-white font-heading font-semibold px-4 py-2 rounded-xl text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Contactar
              </a>
              {!isEditing && <button onClick={() => startEditOrder(order)} className="inline-flex items-center gap-1 bg-purple/10 text-purple hover:bg-purple/20 font-heading font-semibold px-4 py-2 rounded-xl text-sm transition-colors">Editar</button>}
              <button onClick={() => deleteOrder(order.id, order.order_number)} className="inline-flex items-center gap-1 bg-red-50 text-red-500 hover:bg-red-100 font-heading font-semibold px-4 py-2 rounded-xl text-sm transition-colors">Eliminar</button>
            </div>

            {/* Internal note */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 space-y-2">
              {order.internal_note && <p className="font-body text-sm text-gray-700">{order.internal_note}</p>}
              <div className="flex gap-2">
                <input type="text" value={noteInputs[order.id] || ''} onChange={e => setNoteInputs(prev => ({ ...prev, [order.id]: e.target.value }))} placeholder="Agregar nota interna..." className="flex-1 border border-yellow-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-yellow-400 focus:outline-none bg-white" />
                <button onClick={() => saveNote(order.id)} disabled={!(noteInputs[order.id] || '').trim()} className="bg-yellow-400 text-white font-heading font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-yellow-500 transition-colors">Guardar</button>
              </div>
            </div>

            {/* Deposit */}
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-heading font-semibold text-sm text-gray-700">Dep\u00f3sito recibido</span>
                {dep > 0 && <span className="font-heading font-bold text-sm text-teal">{formatCurrency(dep)}</span>}
              </div>
              {dep > 0 && <p className="font-body text-xs text-gray-500">Saldo pendiente: <span className="font-semibold text-purple">{formatCurrency(order.total - dep)}</span></p>}
              <div className="flex gap-2">
                <input type="number" value={depositInputs[order.id] || ''} onChange={e => setDepositInputs(prev => ({ ...prev, [order.id]: e.target.value }))} placeholder="$0.00" min="0" step="0.01" className="flex-1 border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-teal focus:outline-none" />
                <button onClick={() => saveDeposit(order.id)} disabled={!depositInputs[order.id]} className="bg-teal text-white font-heading font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-teal/80 transition-colors">Guardar</button>
              </div>
            </div>

            {/* Transport confirmation */}
            {needsTransport && (
              <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-heading font-semibold text-sm text-gray-700">{'\uD83D\uDE9A'} Transporte</span>
                  {order.transport_cost_confirmed !== null && <span className="font-heading font-bold text-sm text-orange">{formatCurrency(order.transport_cost_confirmed)}</span>}
                </div>
                <div className="flex gap-2">
                  <input type="number" value={transportInputs[order.id] || (order.transport_cost_confirmed !== null ? String(order.transport_cost_confirmed) : '')} onChange={e => setTransportInputs(prev => ({ ...prev, [order.id]: e.target.value }))} placeholder="$0.00" min="0" step="0.01" className="flex-1 border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-orange focus:outline-none" />
                  <button onClick={() => saveTransport(order.id)} disabled={!transportInputs[order.id]} className="bg-orange text-white font-heading font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-orange/80 transition-colors">Confirmar</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Dashboard cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="font-heading font-bold text-2xl text-purple">{totalOrders}</p>
          <p className="font-body text-xs text-gray-400 mt-1">Total Pedidos</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2">
            <p className="font-heading font-bold text-2xl text-teal">{confirmedOrders}</p>
            <span className="text-[10px] font-heading font-semibold px-1.5 py-0.5 rounded-full bg-teal/10 text-teal">{totalOrders > 0 ? `${((confirmedOrders / totalOrders) * 100).toFixed(0)}%` : '0%'}</span>
          </div>
          <p className="font-body text-xs text-gray-400 mt-1">Confirmados</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="font-heading font-bold text-2xl text-purple">{formatCurrency(totalRevenue)}</p>
          <p className="font-body text-xs text-gray-400 mt-1">Ingresos Totales</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="font-heading font-bold text-2xl text-teal">{formatCurrency(confirmedRevenue)}</p>
          <p className="font-body text-xs text-gray-400 mt-1">Ingresos Confirmados</p>
        </div>
      </div>

      {/* Monthly Summary */}
      {monthlySummary.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm">
          <h3 className="font-heading font-bold text-purple mb-3">Resumen por Mes</h3>
          <div className="space-y-2">
            {monthlySummary.map((m) => (
              <div key={m.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="font-heading font-bold text-gray-800">{m.label}</span>
                  <span className="text-gray-400 text-xs ml-2 font-body">{m.count} pedidos</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-heading font-semibold px-2 py-0.5 rounded-full bg-purple/10 text-purple">
                    {m.count > 0 ? `${((m.confirmedCount / m.count) * 100).toFixed(0)}%` : '0%'}
                  </span>
                  <div className="text-right">
                    <p className="font-heading font-bold text-purple">{formatCurrency(m.total)}</p>
                    <p className="text-xs font-body text-teal">Confirmados: {formatCurrency(m.confirmed)} ({m.confirmedCount})</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 border-t-2 border-purple/20">
              <span className="font-heading font-bold text-purple">Total</span>
              <div className="text-right">
                <p className="font-heading font-bold text-lg text-purple">{formatCurrency(totalRevenue)}</p>
                <p className="text-xs font-body text-teal">Confirmados: {formatCurrency(confirmedRevenue)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="font-body text-gray-500 text-sm">{filteredOrders.length} pedido{filteredOrders.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="bg-purple/10 text-purple font-heading font-semibold px-4 py-2 rounded-xl hover:bg-purple/20 transition-colors text-sm">{'\u2B07\uFE0F'} CSV</button>
          <button onClick={() => setSortMode(sortMode === 'created' ? 'event' : 'created')} className="bg-purple/10 text-purple font-heading font-semibold px-4 py-2 rounded-xl hover:bg-purple/20 transition-colors text-sm">
            {sortMode === 'created' ? '\uD83D\uDD50 Por creaci\u00f3n' : '\uD83D\uDCC5 Por evento'}
          </button>
          <button onClick={fetchOrders} disabled={loading} className="bg-purple/10 text-purple font-heading font-semibold px-4 py-2 rounded-xl hover:bg-purple/20 transition-colors disabled:opacity-50 text-sm">
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {([['all', 'Todos'], ['pending', 'Pendientes'], ['confirmed', 'Confirmados']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setStatusFilter(key)} className={`px-4 py-1.5 rounded-full font-heading font-semibold text-sm transition-all ${statusFilter === key ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, fecha o # pedido..." className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl font-body text-sm focus:border-purple focus:outline-none" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {error && <div className="bg-yellow/20 border border-yellow rounded-xl p-4 mb-6"><p className="font-body text-sm text-gray-700">{error}</p></div>}

      {filteredOrders.length === 0 && !loading && !error && (
        <div className="text-center py-12">
          <p className="font-heading text-lg text-gray-400">{search ? 'No se encontraron pedidos' : 'No hay pedidos aún'}</p>
        </div>
      )}

      {groupedByEvent ? (
        groupedByEvent.map(group => (
          <div key={group.date} className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-heading font-bold text-sm text-purple">{group.label}</h3>
              <span className="text-xs font-body text-gray-400">{group.orders.length} pedido{group.orders.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-3">{group.orders.map(renderOrderCard)}</div>
          </div>
        ))
      ) : (
        <div className="space-y-3">{filteredOrders.map(renderOrderCard)}</div>
      )}
    </div>
  );
}

// ─── PRODUCTS TAB ───
const ALL_CATEGORIES = ['planes', 'belleza', 'entretenimiento', 'snacks', 'gymboree', 'inflables', 'piscinas', 'alquiler', 'servicios', 'manualidades'];
const INPUT_CLS = 'w-full border-2 border-gray-200 rounded-xl py-2 px-3 font-body text-sm focus:border-purple focus:outline-none';

interface AdminProduct {
  id: string; name: string; cat: string; price: number; desc: string;
  imgUrl: string; active: boolean; custom?: boolean;
}

interface EditForm {
  name: string; desc: string; price: string; cat: string;
}

function ProductsTab() {
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('');
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', desc: '', price: '', cat: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', cat: 'planes', price: '', desc: '' });
  const [uploading, setUploading] = useState('');
  const [imageKeys, setImageKeys] = useState<Record<string, number>>({});

  const flash = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 2000); };

  // ─── LOAD from constants.ts + Supabase overrides ───
  useEffect(() => {
    async function load() {
      // Use PRODUCTS from constants.ts as the single source of truth
      const builtIn: AdminProduct[] = PRODUCTS.map(p => ({
        id: p.id, name: p.name, cat: p.category, price: p.price,
        desc: p.description, imgUrl: p.image || `/images/products/${p.id}.png`, active: true,
      }));

      try {
        const [overrides, custom] = await Promise.all([
          fetchProductOverrides(),
          fetchAllCustomProducts(),
        ]);

        const ovMap = new Map(overrides.map(o => [o.id, o]));
        const merged = builtIn.map(p => {
          const ov = ovMap.get(p.id);
          if (!ov) return p;
          return {
            ...p,
            name: ov.name_override || p.name,
            price: ov.price_override ?? p.price,
            desc: ov.description_override ?? p.desc,
            cat: ov.category_override || p.cat,
            imgUrl: ov.image_url || p.imgUrl,
            active: !ov.disabled,
          };
        });

        const customMapped: AdminProduct[] = custom.map(cp => ({
          id: cp.id, name: cp.name, cat: cp.category, price: cp.price,
          desc: cp.description || '', imgUrl: cp.image_url || '', active: cp.active, custom: true,
        }));

        setProducts([...merged, ...customMapped]);
      } catch {
        setProducts(builtIn);
      }
    }
    load();
  }, []);

  // ─── UPLOAD IMAGE ───
  const handleUpload = async (productId: string, file: File) => {
    setUploading(productId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', productId);
      formData.append('folder', 'products');
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-pin': ADMIN_PIN }, body: formData });
      if (res.ok) {
        const data = await res.json();
        const newUrl = data.path + '?t=' + Date.now();
        setProducts(prev => prev.map(p => p.id === productId ? { ...p, imgUrl: newUrl } : p));
        setImageKeys(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));

        const product = products.find(p => p.id === productId);
        if (product?.custom) {
          upsertCustomProduct({ id: productId, name: product.name, category: product.cat, price: product.price, description: product.desc, image_url: newUrl, active: product.active }).catch(() => {});
        } else {
          upsertProductOverride({ id: productId, image_url: newUrl }).catch(() => {});
        }
        flash('Foto actualizada');
      } else { flash('Error al subir foto'); }
    } catch { flash('Error de conexión'); }
    finally { setUploading(''); }
  };

  // ─── TOGGLE ACTIVE ───
  const toggleActive = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const nowActive = !product.active;
    setProducts(prev => prev.map(p => p.id === id ? { ...p, active: nowActive } : p));

    if (product.custom) {
      upsertCustomProduct({ id, name: product.name, category: product.cat, price: product.price, description: product.desc, image_url: product.imgUrl || null, active: nowActive }).catch(() => {});
    } else {
      upsertProductOverride({ id, disabled: !nowActive }).catch(() => {});
    }
    flash(nowActive ? 'Producto activado' : 'Producto desactivado');
  };

  // ─── START EDITING ───
  const startEdit = (p: AdminProduct) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, desc: p.desc, price: String(p.price), cat: p.cat });
  };

  // ─── SAVE EDIT ───
  const saveEdit = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;

    const updated: AdminProduct = {
      ...product,
      name: editForm.name || product.name,
      desc: editForm.desc,
      price: Number(editForm.price) || product.price,
      cat: editForm.cat || product.cat,
    };

    setProducts(prev => prev.map(p => p.id === id ? updated : p));
    setEditingId(null);

    if (product.custom) {
      upsertCustomProduct({ id, name: updated.name, category: updated.cat, price: updated.price, description: updated.desc, image_url: product.imgUrl || null, active: product.active }).catch(() => {});
    } else {
      upsertProductOverride({ id, name_override: updated.name, price_override: updated.price, description_override: updated.desc, category_override: updated.cat }).catch(() => {});
    }
    flash('Producto guardado');
  };

  // ─── ADD PRODUCT ───
  const handleAddProduct = async () => {
    if (!newProduct.name.trim()) return;
    const id = `custom-${Date.now()}`;
    const product: AdminProduct = { id, name: newProduct.name, cat: newProduct.cat, price: Number(newProduct.price) || 0, desc: newProduct.desc, imgUrl: '', active: true, custom: true };
    setProducts(prev => [...prev, product]);
    upsertCustomProduct({ id, name: product.name, category: product.cat, price: product.price, description: product.desc, image_url: null, active: true }).catch(() => {});
    setNewProduct({ name: '', cat: 'planes', price: '', desc: '' });
    setShowAdd(false);
    flash('Producto agregado');
  };

  // ─── REMOVE CUSTOM PRODUCT ───
  const handleRemove = async (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    deleteCustomProduct(id).catch(() => {});
    flash('Producto eliminado');
  };

  const filtered = filter ? products.filter(p => p.cat === filter) : products;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-xl text-purple mb-1">Productos</h2>
          <p className="font-body text-gray-500 text-sm">Edita nombre, descripción, precio, categoría y foto</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-purple text-white font-heading font-bold px-4 py-2 rounded-xl text-sm hover:bg-purple-light transition-colors">
          {showAdd ? 'Cancelar' : '+ Agregar'}
        </button>
      </div>

      {message && <div className="rounded-xl p-3 text-sm font-body bg-teal/10 text-teal">{message}</div>}

      {/* Add product form */}
      {showAdd && (
        <div className="bg-white rounded-xl border-2 border-purple/20 p-5 space-y-3">
          <h3 className="font-heading font-bold text-sm text-purple">Nuevo Producto</h3>
          <input type="text" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Nombre" className={INPUT_CLS} />
          <div className="grid grid-cols-2 gap-3">
            <select value={newProduct.cat} onChange={(e) => setNewProduct({ ...newProduct, cat: e.target.value })} className={INPUT_CLS + ' capitalize'}>{ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <input type="number" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} placeholder="Precio ($)" className={INPUT_CLS} />
          </div>
          <input type="text" value={newProduct.desc} onChange={(e) => setNewProduct({ ...newProduct, desc: e.target.value })} placeholder="Descripción" className={INPUT_CLS} />
          <button onClick={handleAddProduct} disabled={!newProduct.name.trim()} className="w-full bg-purple text-white font-heading font-bold py-2.5 rounded-xl disabled:opacity-50">Agregar</button>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter('')} className={`px-3 py-1 rounded-full text-xs font-heading font-semibold ${!filter ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600'}`}>Todos</button>
        {ALL_CATEGORIES.map(c => (
          <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1 rounded-full text-xs font-heading font-semibold capitalize ${filter === c ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600'}`}>{c}</button>
        ))}
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {filtered.map((product) => {
          const isEditing = editingId === product.id;
          const imgSrc = product.imgUrl || `/images/products/${product.id}.png`;

          return (
            <div key={product.id} className={`bg-white rounded-xl border p-3 transition-opacity ${!product.active ? 'opacity-40 border-gray-200' : 'border-gray-100'}`}>
              {/* Collapsed view */}
              <div className="flex items-center gap-3">
                {/* Toggle */}
                <button onClick={() => toggleActive(product.id)} className={`w-10 h-6 rounded-full flex-shrink-0 transition-colors relative ${!product.active ? 'bg-gray-300' : 'bg-teal'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${!product.active ? 'left-1' : 'left-5'}`} />
                </button>

                {/* Image */}
                <label className="w-12 h-12 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img key={`${product.id}-${imageKeys[product.id] || 0}`} src={imgSrc} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <input type="file" accept="image/*" className="hidden" disabled={uploading === product.id} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(product.id, f); }} />
                  {uploading === product.id && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><div className="w-5 h-5 border-2 border-purple border-t-transparent rounded-full animate-spin" /></div>}
                </label>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-heading font-semibold text-sm text-gray-800 truncate">{product.name}</p>
                    <button onClick={() => isEditing ? setEditingId(null) : startEdit(product)} className="flex-shrink-0 text-gray-400 hover:text-purple transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                  </div>
                  <p className="font-body text-xs text-gray-400">{product.cat} · ${product.price}</p>
                </div>

                {/* Delete custom */}
                {product.custom && (
                  <button onClick={() => handleRemove(product.id)} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0" title="Eliminar">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
              </div>

              {/* Expanded edit form */}
              {isEditing && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Nombre" className={INPUT_CLS} />
                  <input type="text" value={editForm.desc} onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })} placeholder="Descripción" className={INPUT_CLS} />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} placeholder="Precio" className={INPUT_CLS} />
                    <select value={editForm.cat} onChange={(e) => setEditForm({ ...editForm, cat: e.target.value })} className={INPUT_CLS + ' capitalize'}>
                      {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(null)} className="flex-1 border-2 border-gray-200 text-gray-600 font-heading font-semibold py-2 rounded-xl text-sm">Cancelar</button>
                    <button onClick={() => saveEdit(product.id)} className="flex-1 bg-purple text-white font-heading font-semibold py-2 rounded-xl text-sm">Guardar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN ADMIN PAGE ───
export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'pedidos' | 'reels' | 'imagenes'>('pedidos');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      setAuthenticated(true);
    } else {
      setError('PIN incorrecto');
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-heading font-bold text-3xl text-purple mb-6">Admin</h1>

      <div className="flex gap-2 mb-8">
        {(['pedidos', 'reels', 'imagenes'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-full font-heading font-semibold text-sm transition-all ${
              tab === t ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t === 'pedidos' ? 'Pedidos' : t === 'reels' ? 'Reels' : 'Productos'}
          </button>
        ))}
      </div>

      {tab === 'pedidos' && <OrdersTab />}
      {tab === 'reels' && <ReelsTab />}
      {tab === 'imagenes' && <ProductsTab />}
    </div>
  );
}
