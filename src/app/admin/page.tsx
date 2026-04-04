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
import { PRODUCTS, CATEGORIES } from '@/lib/constants';

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

// Session token stored after server-side auth validation
let _adminToken = '';
// Keep PIN for backward compat with API headers
let _adminPin = '';

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
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken },
      body: JSON.stringify(body),
    });
    return res.ok;
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/orders', { headers: { 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken } });
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
      const res = await fetch('/api/orders', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken }, body: JSON.stringify({ orderId }) });
      if (res.ok) { setOrders(prev => prev.filter(o => o.id !== orderId)); setExpandedOrder(null); }
      else { alert('Error al eliminar pedido'); }
    } catch (e) {
      console.error('Delete order error:', e);
      alert('Error de conexión al eliminar pedido');
    }
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
    if (file.size > 2 * 1024 * 1024) {
      flash('\u274C Foto muy grande. M\u00e1ximo 2MB. Comprime la imagen antes de subir.');
      return;
    }
    setUploading(productId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', productId);
      formData.append('folder', 'products');
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken }, body: formData });
      if (res.ok) {
        const data = await res.json();
        const newUrl = data.path + '?t=' + Date.now();
        setProducts(prev => prev.map(p => p.id === productId ? { ...p, imgUrl: newUrl } : p));
        setImageKeys(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));

        const product = products.find(p => p.id === productId);
        if (product?.custom) {
          upsertCustomProduct({ id: productId, name: product.name, category: product.cat, price: product.price, description: product.desc, image_url: newUrl, active: product.active }).catch((e) => console.error('Save custom product error:', e));
        } else {
          upsertProductOverride({ id: productId, image_url: newUrl }).catch((e) => console.error('Save override error:', e));
        }
        flash('Foto actualizada');
      } else { flash('Error al subir foto'); }
    } catch (e) { console.error('Upload error:', e); flash('Error de conexión'); }
    finally { setUploading(''); }
  };

  // ─── TOGGLE ACTIVE ───
  const toggleActive = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const nowActive = !product.active;
    setProducts(prev => prev.map(p => p.id === id ? { ...p, active: nowActive } : p));

    if (product.custom) {
      upsertCustomProduct({ id, name: product.name, category: product.cat, price: product.price, description: product.desc, image_url: product.imgUrl || null, active: nowActive }).catch((e) => { console.error('Toggle error:', e); flash('Error al guardar'); });
    } else {
      upsertProductOverride({ id, disabled: !nowActive }).catch((e) => { console.error('Toggle error:', e); flash('Error al guardar'); });
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

    const parsedPrice = parseFloat(editForm.price);
    const updated: AdminProduct = {
      ...product,
      name: editForm.name || product.name,
      desc: editForm.desc,
      price: isNaN(parsedPrice) ? product.price : parsedPrice,
      cat: editForm.cat || product.cat,
    };

    setProducts(prev => prev.map(p => p.id === id ? updated : p));
    setEditingId(null);

    if (product.custom) {
      upsertCustomProduct({ id, name: updated.name, category: updated.cat, price: updated.price, description: updated.desc, image_url: product.imgUrl || null, active: product.active }).catch((e) => { console.error('Save error:', e); flash('Error al guardar'); });
    } else {
      upsertProductOverride({ id, name_override: updated.name, price_override: updated.price, description_override: updated.desc, category_override: updated.cat }).catch((e) => { console.error('Save error:', e); flash('Error al guardar'); });
    }
    flash('Producto guardado');
  };

  // ─── ADD PRODUCT ───
  const handleAddProduct = async () => {
    if (!newProduct.name.trim()) return;
    const id = `custom-${Date.now()}`;
    const product: AdminProduct = { id, name: newProduct.name, cat: newProduct.cat, price: Number(newProduct.price) || 0, desc: newProduct.desc, imgUrl: '', active: true, custom: true };
    setProducts(prev => [...prev, product]);
    upsertCustomProduct({ id, name: product.name, category: product.cat, price: product.price, description: product.desc, image_url: null, active: true }).catch((e) => { console.error('Add product error:', e); flash('Error al guardar'); });
    setNewProduct({ name: '', cat: 'planes', price: '', desc: '' });
    setShowAdd(false);
    flash('Producto agregado');
  };

  // ─── REMOVE CUSTOM PRODUCT ───
  const handleRemove = async (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    deleteCustomProduct(id).catch((e) => { console.error('Delete product error:', e); flash('Error al eliminar'); });
    flash('Producto eliminado');
  };

  const [productSearch, setProductSearch] = useState('');

  const filtered = products.filter(p => {
    const matchFilter = !filter || p.cat === filter;
    const matchSearch = !productSearch.trim() || p.name.toLowerCase().includes(productSearch.toLowerCase());
    return matchFilter && matchSearch;
  });

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

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar producto por nombre..." className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl font-body text-sm focus:border-purple focus:outline-none" />
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
            <select value={newProduct.cat} onChange={(e) => setNewProduct({ ...newProduct, cat: e.target.value })} className={INPUT_CLS}>{ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORIES.find(cat => cat.id === c)?.label || c}</option>)}</select>
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
          <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1 rounded-full text-xs font-heading font-semibold ${filter === c ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600'}`}>{CATEGORIES.find(cat => cat.id === c)?.label || c}</button>
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
                  <p className="font-body text-xs text-gray-400">{CATEGORIES.find(c => c.id === product.cat)?.label || product.cat} · ${product.price}</p>
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
                    <select value={editForm.cat} onChange={(e) => setEditForm({ ...editForm, cat: e.target.value })} className={INPUT_CLS}>
                      {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORIES.find(cat => cat.id === c)?.label || c}</option>)}
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

// ─── CATALOG TAB ───
function CatalogTab() {
  const [categories, setCategories] = useState<{ id: string; label: string; icon: string; description: string; subtitle?: string }[]>([]);
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [flashMsg, setFlashMsg] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', emoji: '', description: '' });

  const flash = (msg: string) => { setFlashMsg(msg); setTimeout(() => setFlashMsg(''), 2000); };

  // Count products per category
  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of PRODUCTS) { counts[p.category] = (counts[p.category] || 0) + 1; }
    return counts;
  }, []);

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
    await upsertSetting('category_overrides', overrides);
    setCategories(prev => prev.map(c => c.id === editingCatId ? { ...c, label: editForm.name, icon: editForm.emoji, subtitle: editForm.subtitle || undefined } : c));
    setEditingCatId(null);
    setSaving(false);
    flash('Categor\u00eda guardada');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-xl text-purple mb-1">Cat\u00e1logo</h2>
          <p className="font-body text-gray-500 text-sm">Edita nombre, emoji y subt\u00edtulo de cada categor\u00eda</p>
        </div>
        <button onClick={() => setShowNewCat(!showNewCat)} className="bg-purple text-white font-heading font-bold px-4 py-2 rounded-xl text-sm hover:bg-purple-light transition-colors">{showNewCat ? 'Cancelar' : '+ Nueva categor\u00eda'}</button>
      </div>

      {flashMsg && <div className="rounded-xl p-3 text-sm font-body bg-teal/10 text-teal">{flashMsg}</div>}

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
              if (!id) { flash('Nombre inv\u00e1lido'); return; }
              if ([...ALL_CATEGORIES, ...categories.map(c => c.id)].includes(id)) { flash('Esa categor\u00eda ya existe'); return; }
              const item = { id, label: newCat.name.trim(), icon: newCat.emoji || '\uD83C\uDF88', description: newCat.description.trim() };
              const existing = await fetchSetting<Array<{ id: string; label: string; icon: string; description: string }>>('custom_categories') || [];
              await upsertSetting('custom_categories', [...existing, item]);
              setCategories(prev => [...prev, item]);
              setNewCat({ name: '', emoji: '', description: '' });
              setShowNewCat(false);
              flash('\u2705 Categor\u00eda creada');
            }}
            disabled={!newCat.name.trim()}
            className="w-full bg-purple text-white font-heading font-bold py-2.5 rounded-xl disabled:opacity-50"
          >
            Crear categor&iacute;a
          </button>
        </div>
      )}

      <div className="space-y-2">
        {categories.map(cat => {
          const isExpanded = expandedCatId === cat.id;
          const isEditing = editingCatId === cat.id;
          const count = productCounts[cat.id] || 0;

          return (
            <div key={cat.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <button onClick={() => { setExpandedCatId(isExpanded ? null : cat.id); if (isEditing) setEditingCatId(null); }} className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cat.icon}</span>
                    <div>
                      <span className="font-heading font-bold text-gray-800">{cat.label}</span>
                      {cat.subtitle && <p className="font-body text-xs text-gray-400 mt-0.5">{cat.subtitle}</p>}
                    </div>
                  </div>
                  <span className="text-xs font-heading font-semibold px-2 py-0.5 rounded-full bg-purple/10 text-purple">{count} productos</span>
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[60px_1fr] gap-2">
                        <input value={editForm.emoji || ''} onChange={e => setEditForm(p => ({ ...p, emoji: e.target.value }))} placeholder="Emoji" className="border border-gray-200 rounded-lg py-1.5 px-2 font-body text-center text-lg focus:border-purple focus:outline-none" />
                        <input value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre" className="border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none" />
                      </div>
                      <input value={editForm.subtitle || ''} onChange={e => setEditForm(p => ({ ...p, subtitle: e.target.value }))} placeholder="Subt\u00edtulo (opcional)" className="w-full border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none" />
                      <div className="flex gap-2">
                        <button onClick={() => setEditingCatId(null)} className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-2 rounded-xl text-sm">Cancelar</button>
                        <button onClick={saveEdit} disabled={saving} className="flex-1 bg-purple text-white font-heading font-semibold py-2 rounded-xl text-sm disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="font-body text-sm text-gray-500">
                        <p>ID: <span className="text-gray-800">{cat.id}</span></p>
                        <p>Descripci\u00f3n: <span className="text-gray-800">{cat.description}</span></p>
                      </div>
                      <button onClick={() => startEdit(cat)} className="bg-purple/10 text-purple hover:bg-purple/20 font-heading font-semibold px-4 py-2 rounded-xl text-sm transition-colors">Editar</button>
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

function WebsiteTab() {
  const [section, setSection] = useState<'homepage' | 'featured' | 'areas' | 'reels' | 'logo' | 'testimonials'>('homepage');
  const [flash, setFlash] = useState('');
  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(''), 2000); };

  // ─── A) HOMEPAGE ───
  const [hp, setHp] = useState({
    hero_title: '', hero_subtitle: '', hero_cta_primary: '', hero_cta_secondary: '', social_proof_text: '',
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
    await upsertSetting('homepage_content', hp);
    showFlash('Homepage guardado');
  };

  // ─── B) FEATURED ───
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [featLoaded, setFeatLoaded] = useState(false);

  useEffect(() => {
    fetchSetting<string[]>('featured_products').then(d => {
      if (d) setFeaturedIds(d);
      setFeatLoaded(true);
    }).catch((e) => { console.error('Load featured error:', e); setFeatLoaded(true); });
  }, []);

  const toggleFeatured = (id: string) => {
    setFeaturedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 6 ? [...prev, id] : prev);
  };

  const saveFeatured = async () => {
    await upsertSetting('featured_products', featuredIds);
    showFlash('Productos destacados guardados');
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
    const clean = areas.filter(a => a.name.trim());
    await upsertSetting('event_areas', clean);
    setAreas(clean);
    showFlash('\u00c1reas guardadas');
  };

  // ─── D) REELS (inline) ───
  const [reelUrls, setReelUrls] = useState(['', '', '']);
  const [reelsSaved, setReelsSaved] = useState(false);

  useEffect(() => {
    fetchSetting<Array<{ url: string; id: string }>>('reels').then(d => {
      if (d && d.length > 0) setReelUrls([d[0]?.url || '', d[1]?.url || '', d[2]?.url || '']);
    }).catch((e) => console.error('Load reels error:', e));
  }, []);

  // ─── E) LOGO ───
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    fetchSetting<string>('site_logo_url').then(u => { if (u) setLogoUrl(u); }).catch((e) => console.error('Load logo error:', e));
  }, []);

  const handleLogoUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { showFlash('\u274c Foto muy grande. M\u00e1ximo 2MB.'); return; }
    if (!file.type.startsWith('image/')) { showFlash('\u274c Solo se permiten im\u00e1genes.'); return; }
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', 'site-logo');
      formData.append('folder', 'logos');
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken }, body: formData });
      if (res.ok) {
        const data = await res.json();
        const url = data.path + '?t=' + Date.now();
        await upsertSetting('site_logo_url', url);
        setLogoUrl(url);
        showFlash('Logo actualizado');
      } else { showFlash('Error al subir logo'); }
    } catch { showFlash('Error de conexi\u00f3n'); }
    finally { setLogoUploading(false); }
  };

  const resetLogo = async () => {
    await upsertSetting('site_logo_url', null);
    setLogoUrl(null);
    showFlash('Logo tipogr\u00e1fico restaurado');
  };

  const extractReelIdLocal = (url: string) => { const m = url.match(/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/); return m ? m[1] : null; };

  const saveReels = async () => {
    const reels = reelUrls.filter(Boolean).map(url => { const id = extractReelIdLocal(url); return id ? { url, id } : null; }).filter(Boolean);
    await upsertSetting('reels', reels);
    setReelsSaved(true);
    setTimeout(() => setReelsSaved(false), 2000);
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
    const clean = testimonials.filter(t => t.name.trim() && t.text.trim());
    await upsertSetting('testimonials', clean);
    showFlash('\u2705 Testimonios guardados');
  };

  const SUB_TABS: { key: typeof section; label: string }[] = [
    { key: 'homepage', label: 'Homepage' },
    { key: 'logo', label: 'Logo' },
    { key: 'featured', label: 'Destacados' },
    { key: 'areas', label: '\u00c1reas' },
    { key: 'reels', label: 'Reels' },
    { key: 'testimonials', label: 'Testimonios' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="font-heading font-bold text-xl text-purple">Sitio Web</h2>

      {/* Sub-tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSection(t.key)} className={`px-4 py-1.5 rounded-full font-heading font-semibold text-xs transition-all shrink-0 ${section === t.key ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t.label}</button>
        ))}
      </div>

      {flash && <div className="rounded-xl p-3 text-sm font-body bg-teal/10 text-teal">{flash}</div>}

      {/* A) Homepage */}
      {section === 'homepage' && hpLoaded && (
        <div className="space-y-4">
          <p className="font-body text-gray-500 text-sm">Edita los textos del homepage. Deja vac\u00edo para usar el valor por defecto.</p>
          {([
            ['hero_title', 'T\u00edtulo Hero (H1)', 'Fiestas que los ni\u00f1os nunca olvidan'],
            ['hero_subtitle', 'Subt\u00edtulo Hero', 'Animaci\u00f3n, alquiler y manualidades...'],
            ['hero_cta_primary', 'Bot\u00f3n Principal', 'Ver Cat\u00e1logo'],
            ['social_proof_text', 'Social Proof', '+200 fiestas realizadas \u00b7 Panam\u00e1'],
            ['services_title', 'T\u00edtulo Servicios', 'Nuestros Servicios'],
            ['services_subtitle', 'Subt\u00edtulo Servicios', 'Todo lo que necesitas...'],
            ['featured_title', 'T\u00edtulo Destacados', 'Los M\u00e1s Populares'],
            ['featured_subtitle', 'Subt\u00edtulo Destacados', 'Los favoritos de nuestros clientes'],
            ['cta_section_title', 'T\u00edtulo CTA', 'Haz tu reserva hoy'],
            ['cta_section_subtitle', 'Subt\u00edtulo CTA', 'Arma tu paquete ideal...'],
          ] as const).map(([key, label, placeholder]) => (
            <div key={key}>
              <label className="block font-heading font-semibold text-xs text-gray-500 mb-1">{label}</label>
              <input value={hp[key]} onChange={e => setHp(prev => ({ ...prev, [key]: e.target.value }))} placeholder={placeholder} className={WI_CLS} />
            </div>
          ))}
          <button onClick={saveHomepage} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm">Guardar Homepage</button>
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
                <p className="font-body text-xs text-gray-400 mt-2">Logo tipogr\u00e1fico (por defecto)</p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <label className={`flex-1 bg-purple text-white font-heading font-bold py-2.5 rounded-xl text-sm text-center cursor-pointer hover:bg-purple-light transition-colors ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {logoUploading ? 'Subiendo...' : 'Subir Logo'}
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
            </label>
            {logoUrl && (
              <button onClick={resetLogo} className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">Usar logo tipogr\u00e1fico</button>
            )}
          </div>
        </div>
      )}

      {/* B) Featured Products */}
      {section === 'featured' && featLoaded && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-body text-gray-500 text-sm">Selecciona hasta 6 productos para &ldquo;Los M\u00e1s Populares&rdquo;</p>
            <span className={`font-heading font-bold text-sm ${featuredIds.length >= 6 ? 'text-orange' : 'text-purple'}`}>{featuredIds.length}/6</span>
          </div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {PRODUCTS.map(p => {
              const checked = featuredIds.includes(p.id);
              const disabled = !checked && featuredIds.length >= 6;
              return (
                <label key={p.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-teal/10' : 'hover:bg-gray-50'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleFeatured(p.id)} className="w-4 h-4 accent-teal" />
                  <div className="flex-1 min-w-0">
                    <span className="font-heading font-semibold text-sm text-gray-800 truncate block">{p.name}</span>
                    <span className="font-body text-xs text-gray-400">{p.category} \u00b7 {formatCurrency(p.price)}</span>
                  </div>
                </label>
              );
            })}
          </div>
          <button onClick={saveFeatured} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm">Guardar Destacados</button>
        </div>
      )}

      {/* C) Areas */}
      {section === 'areas' && areasLoaded && (
        <div className="space-y-4">
          <p className="font-body text-gray-500 text-sm">\u00c1reas de cobertura con precio de transporte</p>
          <div className="space-y-2">
            {areas.map((area, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={area.name} onChange={e => setAreas(prev => prev.map((a, j) => j === i ? { ...a, name: e.target.value } : a))} placeholder="Nombre del \u00e1rea" className={`flex-1 ${WI_CLS}`} />
                <div className="flex items-center gap-1">
                  <span className="font-body text-sm text-gray-400">$</span>
                  <input type="number" value={area.price} onChange={e => setAreas(prev => prev.map((a, j) => j === i ? { ...a, price: Number(e.target.value) || 0 } : a))} className={`w-20 ${WI_CLS}`} min="0" />
                </div>
                <button onClick={() => setAreas(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAreas(prev => [...prev, { name: '', price: 0 }])} className="bg-gray-100 text-gray-600 font-heading font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors">+ Agregar \u00e1rea</button>
            <button onClick={saveAreas} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm">Guardar \u00c1reas</button>
          </div>
        </div>
      )}

      {/* D) Reels */}
      {section === 'reels' && (
        <div className="space-y-4">
          <p className="font-body text-gray-500 text-sm">Pega los links de los 3 reels para la p\u00e1gina principal</p>
          {reelUrls.map((url, i) => (
            <div key={i}>
              <label className="block font-heading font-semibold text-sm text-gray-600 mb-1">Reel {i + 1}</label>
              <input type="url" value={url} onChange={e => { const u = [...reelUrls]; u[i] = e.target.value; setReelUrls(u); }} placeholder="https://www.instagram.com/reel/ABC123..." className={WI_CLS} />
              {url && extractReelIdLocal(url) && <p className="text-xs text-teal mt-1 font-body">ID: {extractReelIdLocal(url)}</p>}
            </div>
          ))}
          <button onClick={saveReels} className={`px-6 py-2.5 rounded-xl font-heading font-bold text-white transition-colors ${reelsSaved ? 'bg-teal' : 'bg-purple hover:bg-purple-light'}`}>{reelsSaved ? 'Guardado' : 'Guardar Reels'}</button>
        </div>
      )}

      {/* F) Testimonials */}
      {section === 'testimonials' && testimonialsLoaded && (
        <div className="space-y-4">
          <p className="font-body text-gray-500 text-sm">Edita los testimonios que aparecen en la p&aacute;gina principal (m&aacute;x 6)</p>
          {testimonials.map((t, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <input value={t.avatar} onChange={e => setTestimonials(prev => prev.map((item, j) => j === i ? { ...item, avatar: e.target.value } : item))} placeholder="{'\uD83D\uDC69'}" maxLength={4} className="w-14 border border-gray-200 rounded-lg py-1.5 px-2 font-body text-center text-lg focus:border-purple focus:outline-none" />
                <input value={t.name} onChange={e => setTestimonials(prev => prev.map((item, j) => j === i ? { ...item, name: e.target.value } : item))} placeholder="Nombre de la mam&aacute;" className={`flex-1 ${WI_CLS}`} />
                {testimonials.length > 1 && (
                  <button onClick={() => setTestimonials(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
              </div>
              <textarea value={t.text} onChange={e => setTestimonials(prev => prev.map((item, j) => j === i ? { ...item, text: e.target.value } : item))} placeholder="Texto del testimonio..." rows={3} className={WI_CLS} />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setTestimonials(prev => prev.length < 6 ? [...prev, { name: '', text: '', avatar: '\uD83D\uDC69' }] : prev)} disabled={testimonials.length >= 6} className="bg-gray-100 text-gray-600 font-heading font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors disabled:opacity-40">+ Agregar testimonio</button>
            <button onClick={saveTestimonials} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm">Guardar Testimonios</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ADMIN PAGE ───
export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'pedidos' | 'website' | 'catalogo' | 'imagenes'>('pedidos');

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
        _adminPin = pin;
        _adminToken = data.token || '';
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-heading font-bold text-3xl text-purple mb-6">Admin</h1>

      <div className="flex gap-2 mb-8 overflow-x-auto">
        {([['pedidos', 'Pedidos'], ['website', 'Sitio Web'], ['catalogo', 'Categor\u00edas'], ['imagenes', 'Productos']] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-full font-heading font-semibold text-sm transition-all shrink-0 ${
              tab === t ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'pedidos' && <OrdersTab />}
      {tab === 'website' && <WebsiteTab />}
      {tab === 'catalogo' && <CatalogTab />}
      {tab === 'imagenes' && <ProductsTab />}
    </div>
  );
}
