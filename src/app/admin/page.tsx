'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatCurrency } from '@/lib/format';
import { EVENT_AREAS } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import {
  fetchProductOverrides,
  fetchAllCustomProducts,
  upsertProductOverride,
  upsertCustomProduct,
  deleteCustomProduct,
  fetchSetting,
  upsertSetting,
  fetchProductImages,
  upsertProductImages,
} from '@/lib/supabase-data';
import { PRODUCTS, CATEGORIES } from '@/lib/constants';
import { DEFAULT_SITE_TEXTS, SITE_TEXT_LABELS, SiteTexts, clearSiteTextsCache } from '@/lib/site-texts';

type OrderStatus = 'nuevo' | 'aprobada' | 'rechazada' | 'realizado';
const ORDER_STATUSES: { key: OrderStatus; label: string; color: string; bg: string }[] = [
  { key: 'nuevo', label: 'Nuevo', color: 'text-gray-600', bg: 'bg-gray-200' },
  { key: 'aprobada', label: 'Aprobada', color: 'text-teal', bg: 'bg-teal' },
  { key: 'rechazada', label: 'Rechazada', color: 'text-red-500', bg: 'bg-red-500' },
  { key: 'realizado', label: 'Realizado', color: 'text-purple', bg: 'bg-purple' },
];

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
  transport_cost_confirmed: number | null;
  created_at: string;
  confirmed: boolean;
  items: OrderItem[];
}

function getOrderStatus(order: Order): OrderStatus {
  if (order.status) return order.status as OrderStatus;
  return order.confirmed ? 'aprobada' : 'nuevo';
}

// Session token stored after server-side auth validation
let _adminToken = '';
// Keep PIN for backward compat with API headers
let _adminPin = '';

// ─── ORDERS TAB ───
const OI_CLS = 'w-full border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none';

function OrdersTab() {
  const { showToast } = useToast();
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
  const [depositDateInputs, setDepositDateInputs] = useState<Record<number, string>>({});
  const [transportInputs, setTransportInputs] = useState<Record<number, string>>({});
  const [discountInputs, setDiscountInputs] = useState<Record<number, string>>({});
  const [editingItems, setEditingItems] = useState<number | null>(null);
  const [itemEdits, setItemEdits] = useState<Record<number, { quantity: string; unit_price: string }>>({});
  const [newItemForm, setNewItemForm] = useState<{ name: string; qty: string; price: string }>({ name: '', qty: '1', price: '' });
  const [savingAction, setSavingAction] = useState<string | null>(null);

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
    const confirmed = newStatus === 'aprobada' || newStatus === 'realizado';
    const label = ORDER_STATUSES.find(s => s.key === newStatus)?.label || newStatus;
    setSavingAction(`status-${orderId}`);
    try {
      if (await patchOrder({ orderId, status: newStatus })) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus, confirmed } : o));
        showToast(`Estado: ${label}`);
      } else { showToast('Error al cambiar estado'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const deleteOrder = async (orderId: number, orderNumber: number) => {
    if (!window.confirm(`\u00bfEliminar pedido #${orderNumber}? Esta acci\u00f3n no se puede deshacer.`)) return;
    setSavingAction(`delete-${orderId}`);
    try {
      const res = await fetch('/api/orders', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken }, body: JSON.stringify({ orderId }) });
      if (res.ok) { setOrders(prev => prev.filter(o => o.id !== orderId)); setExpandedOrder(null); showToast('Pedido eliminado'); }
      else { showToast('Error al eliminar pedido'); }
    } catch (e) {
      console.error('Delete order error:', e);
      showToast('Error de conexi\u00f3n al eliminar');
    } finally { setSavingAction(null); }
  };

  const saveNote = async (orderId: number) => {
    const text = (noteInputs[orderId] || '').trim();
    if (!text) return;
    setSavingAction(`note-${orderId}`);
    try {
      if (await patchOrder({ orderId, internalNote: text })) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, internal_note: text } : o));
        setNoteInputs(prev => ({ ...prev, [orderId]: '' }));
        showToast('Nota guardada');
      } else { showToast('Error al guardar nota'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
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
    setSavingAction(`edit-${orderId}`);
    try {
      if (await patchOrder({ orderId, editFields })) {
        setOrders(prev => prev.map(o => o.id === orderId ? {
          ...o, customer_name: f.customer_name, customer_phone: f.customer_phone, customer_email: f.customer_email || null,
          event_date: f.event_date, event_time: f.event_time, event_area: f.event_area || null, event_address: f.event_address,
          birthday_child_name: f.birthday_child_name || null, birthday_child_age: f.birthday_child_age ? Number(f.birthday_child_age) : null,
          notes: f.notes || null,
        } : o));
        setEditingOrderId(null);
        showToast('Pedido actualizado');
      } else { showToast('Error al guardar cambios'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const addDeposit = async (orderId: number) => {
    const val = Number(depositInputs[orderId]);
    if (isNaN(val) || val <= 0) return;
    const date = depositDateInputs[orderId] || new Date().toISOString().slice(0, 10);
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const newDeposits = [...(order.deposits || []), { amount: val, date }];
    const totalDep = newDeposits.reduce((s, d) => s + d.amount, 0);
    setSavingAction(`deposit-${orderId}`);
    try {
      if (await patchOrder({ orderId, deposits: newDeposits, depositAmount: totalDep })) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, deposits: newDeposits, deposit_amount: totalDep } : o));
        setDepositInputs(prev => ({ ...prev, [orderId]: '' }));
        showToast('Dep\u00f3sito agregado');
      } else { showToast('Error al guardar dep\u00f3sito'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const removeDeposit = async (orderId: number, index: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const newDeposits = (order.deposits || []).filter((_, i) => i !== index);
    const totalDep = newDeposits.reduce((s, d) => s + d.amount, 0);
    setSavingAction(`deposit-${orderId}`);
    try {
      if (await patchOrder({ orderId, deposits: newDeposits, depositAmount: totalDep })) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, deposits: newDeposits, deposit_amount: totalDep } : o));
        showToast('Dep\u00f3sito eliminado');
      } else { showToast('Error al eliminar dep\u00f3sito'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const saveDiscount = async (orderId: number) => {
    const val = Number(discountInputs[orderId]);
    if (isNaN(val) || val < 0) return;
    setSavingAction(`discount-${orderId}`);
    try {
      if (await patchOrder({ orderId, discount: val })) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, discount: val } : o));
        setDiscountInputs(prev => ({ ...prev, [orderId]: '' }));
        showToast('Descuento guardado');
      } else { showToast('Error al guardar descuento'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const startEditItems = (order: Order) => {
    setEditingItems(order.id);
    const edits: Record<number, { quantity: string; unit_price: string }> = {};
    for (const item of order.items) {
      if (item.id) edits[item.id] = { quantity: String(item.quantity), unit_price: String(item.unit_price) };
    }
    setItemEdits(edits);
    setNewItemForm({ name: '', qty: '1', price: '' });
  };

  const saveItemEdits = async (orderId: number) => {
    const editItems = Object.entries(itemEdits).map(([id, vals]) => ({
      id: Number(id),
      quantity: Number(vals.quantity) || 1,
      unit_price: Number(vals.unit_price) || 0,
    }));
    setSavingAction(`items-${orderId}`);
    try {
      if (await patchOrder({ orderId, editItems })) {
        await fetchOrders();
        setEditingItems(null);
        showToast('Items actualizados');
      } else { showToast('Error al guardar items'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const handleAddItem = async (orderId: number) => {
    if (!newItemForm.name.trim() || !newItemForm.price) return;
    setSavingAction(`additem-${orderId}`);
    try {
      if (await patchOrder({ orderId, addItem: { product_name: newItemForm.name, quantity: Number(newItemForm.qty) || 1, unit_price: Number(newItemForm.price) || 0 } })) {
        await fetchOrders();
        setNewItemForm({ name: '', qty: '1', price: '' });
        showToast('Item agregado');
      } else { showToast('Error al agregar item'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const handleRemoveItem = async (orderId: number, itemId: number) => {
    if (!window.confirm('¿Eliminar este item?')) return;
    setSavingAction(`removeitem-${orderId}`);
    try {
      if (await patchOrder({ orderId, removeItem: itemId })) {
        await fetchOrders();
        showToast('Item eliminado');
      } else { showToast('Error al eliminar item'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const saveTransport = async (orderId: number) => {
    const val = Number(transportInputs[orderId]);
    if (isNaN(val) || val < 0) return;
    setSavingAction(`transport-${orderId}`);
    try {
      if (await patchOrder({ orderId, transportCostConfirmed: val })) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, transport_cost_confirmed: val } : o));
        setTransportInputs(prev => ({ ...prev, [orderId]: '' }));
        showToast('Transporte confirmado');
      } else { showToast('Error al confirmar transporte'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
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

  // Monthly summary — only confirmed orders (aprobada/realizado)
  const monthlySummary = useMemo(() => {
    const confirmedOnly = orders.filter(o => o.confirmed);
    const months: Record<string, { total: number; count: number }> = {};
    for (const o of confirmedOnly) {
      const date = new Date(o.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!months[key]) months[key] = { total: 0, count: 0 };
      months[key].total += o.total;
      months[key].count += 1;
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
    const deposits = order.deposits || [];
    const totalDeposits = deposits.reduce((s, d) => s + d.amount, 0) || (order.deposit_amount ?? 0);

    return (
      <div key={order.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${st === 'nuevo' ? 'border-gray-100' : st === 'aprobada' ? 'border-teal/30' : st === 'rechazada' ? 'border-red-200' : 'border-purple/30'}`}>
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
                <p className="font-body text-gray-700 text-sm mt-0.5">{order.customer_name} {'·'} {order.event_date}</p>
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
                  disabled={savingAction === `status-${order.id}`}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-heading font-semibold transition-all disabled:opacity-50 ${st === s.key ? `${s.bg} text-white` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
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
                  <button onClick={() => setEditingOrderId(null)} disabled={savingAction === `edit-${order.id}`} className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-2 rounded-xl text-sm disabled:opacity-50">Cancelar</button>
                  <button onClick={() => saveEditOrder(order.id)} disabled={savingAction === `edit-${order.id}`} className="flex-1 bg-purple text-white font-heading font-semibold py-2 rounded-xl text-sm disabled:opacity-50">{savingAction === `edit-${order.id}` ? 'Guardando...' : 'Guardar cambios'}</button>
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

            {/* Items (editable) */}
            {order.items.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="font-heading font-semibold text-xs text-gray-500 uppercase">Factura</span>
                  {editingItems === order.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => setEditingItems(null)} className="text-xs text-gray-500 font-heading font-semibold hover:text-gray-700">Cancelar</button>
                      <button onClick={() => saveItemEdits(order.id)} disabled={savingAction === `items-${order.id}`} className="text-xs text-teal font-heading font-semibold hover:text-teal/80 ml-2">{savingAction === `items-${order.id}` ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                  ) : (
                    <button onClick={() => startEditItems(order)} className="text-xs text-purple font-heading font-semibold hover:underline">Editar factura</button>
                  )}
                </div>
                <div className="divide-y divide-gray-100">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm gap-2">
                      {editingItems === order.id && item.id ? (
                        <>
                          <span className="flex-1 truncate text-gray-700">{item.product_name}</span>
                          <input type="number" value={itemEdits[item.id]?.quantity || ''} onChange={e => setItemEdits(prev => ({ ...prev, [item.id!]: { ...prev[item.id!], quantity: e.target.value } }))} className="w-12 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" min="1" />
                          <span className="text-gray-400 text-xs">x</span>
                          <input type="number" value={itemEdits[item.id]?.unit_price || ''} onChange={e => setItemEdits(prev => ({ ...prev, [item.id!]: { ...prev[item.id!], unit_price: e.target.value } }))} className="w-20 border border-gray-200 rounded px-1 py-0.5 text-right text-xs" min="0" step="0.01" />
                          <button onClick={() => handleRemoveItem(order.id, item.id!)} className="text-gray-400 hover:text-red-500 ml-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-700">{item.product_name} <span className="text-gray-400">x{item.quantity}</span></span>
                          <span className="font-semibold">{formatCurrency(item.line_total)}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {/* Add new item */}
                {editingItems === order.id && (
                  <div className="border-t border-gray-200 px-3 py-2 bg-gray-50/50 space-y-2">
                    <p className="text-xs font-heading font-semibold text-gray-500">Agregar item</p>
                    <div className="flex gap-1">
                      <input type="text" value={newItemForm.name} onChange={e => setNewItemForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre" className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs font-body" />
                      <input type="number" value={newItemForm.qty} onChange={e => setNewItemForm(p => ({ ...p, qty: e.target.value }))} placeholder="Qty" className="w-12 border border-gray-200 rounded px-1 py-1 text-center text-xs" min="1" />
                      <input type="number" value={newItemForm.price} onChange={e => setNewItemForm(p => ({ ...p, price: e.target.value }))} placeholder="$" className="w-20 border border-gray-200 rounded px-1 py-1 text-right text-xs" min="0" step="0.01" />
                      <button onClick={() => handleAddItem(order.id)} disabled={!newItemForm.name.trim() || !newItemForm.price || savingAction === `additem-${order.id}`} className="bg-purple text-white font-heading font-semibold px-2 py-1 rounded text-xs disabled:opacity-40">+</button>
                    </div>
                  </div>
                )}
                {/* Totals */}
                <div className="border-t border-gray-200 px-3 py-2 space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Subtotal</span>
                    <span>{formatCurrency(order.subtotal)}</span>
                  </div>
                  {(order.transport_cost_confirmed ?? 0) > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Transporte</span>
                      <span>{formatCurrency(order.transport_cost_confirmed!)}</span>
                    </div>
                  )}
                  {order.surcharge > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Recargo tarjeta</span>
                      <span>{formatCurrency(order.surcharge)}</span>
                    </div>
                  )}
                  {(order.discount ?? 0) > 0 && (
                    <div className="flex justify-between text-xs text-green-600 font-semibold">
                      <span>Descuento</span>
                      <span>-{formatCurrency(order.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-heading font-bold text-purple border-t border-gray-100 pt-1">
                    <span>Total</span>
                    <span>{formatCurrency(order.total)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Discount */}
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-heading font-semibold text-sm text-gray-700">{'🏷️'} Descuento</span>
                {(order.discount ?? 0) > 0 && <span className="font-heading font-bold text-sm text-green-600">-{formatCurrency(order.discount)}</span>}
              </div>
              <div className="flex gap-2">
                <input type="number" value={discountInputs[order.id] || ''} onChange={e => setDiscountInputs(prev => ({ ...prev, [order.id]: e.target.value }))} placeholder="$0.00" min="0" step="0.01" className="flex-1 border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-green-500 focus:outline-none" />
                <button onClick={() => saveDiscount(order.id)} disabled={!discountInputs[order.id] || savingAction === `discount-${order.id}`} className="bg-green-600 text-white font-heading font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-green-700 transition-colors">{savingAction === `discount-${order.id}` ? 'Guardando...' : 'Aplicar'}</button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <a href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-[#25D366] text-white font-heading font-semibold px-4 py-2 rounded-xl text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Contactar
              </a>
              {!isEditing && <button onClick={() => startEditOrder(order)} className="inline-flex items-center gap-1 bg-purple/10 text-purple hover:bg-purple/20 font-heading font-semibold px-4 py-2 rounded-xl text-sm transition-colors">Editar</button>}
              <button onClick={() => deleteOrder(order.id, order.order_number)} disabled={savingAction === `delete-${order.id}`} className="inline-flex items-center gap-1 bg-red-50 text-red-500 hover:bg-red-100 font-heading font-semibold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50">{savingAction === `delete-${order.id}` ? 'Eliminando...' : 'Eliminar'}</button>
            </div>

            {/* Internal note */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 space-y-2">
              {order.internal_note && <p className="font-body text-sm text-gray-700">{order.internal_note}</p>}
              <div className="flex gap-2">
                <input type="text" value={noteInputs[order.id] || ''} onChange={e => setNoteInputs(prev => ({ ...prev, [order.id]: e.target.value }))} placeholder="Agregar nota interna..." className="flex-1 border border-yellow-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-yellow-400 focus:outline-none bg-white" />
                <button onClick={() => saveNote(order.id)} disabled={!(noteInputs[order.id] || '').trim() || savingAction === `note-${order.id}`} className="bg-yellow-400 text-white font-heading font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-yellow-500 transition-colors">{savingAction === `note-${order.id}` ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>

            {/* Deposits */}
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-heading font-semibold text-sm text-gray-700">{'💰'} Dep{'ó'}sitos</span>
                {totalDeposits > 0 && <span className="font-heading font-bold text-sm text-teal">{formatCurrency(totalDeposits)}</span>}
              </div>
              {deposits.length > 0 && (
                <div className="space-y-1">
                  {deposits.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-teal/5 rounded-lg px-2 py-1">
                      <span className="font-body text-gray-600">{d.date}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-semibold text-teal">{formatCurrency(d.amount)}</span>
                        <button onClick={() => removeDeposit(order.id, i)} className="text-gray-400 hover:text-red-500 text-xs">{'✕'}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {totalDeposits > 0 && <p className="font-body text-xs text-gray-500">Saldo pendiente: <span className="font-semibold text-purple">{formatCurrency(order.total - totalDeposits)}</span></p>}
              <div className="flex gap-2">
                <input type="date" value={depositDateInputs[order.id] || new Date().toISOString().slice(0, 10)} onChange={e => setDepositDateInputs(prev => ({ ...prev, [order.id]: e.target.value }))} className="border border-gray-200 rounded-lg py-1.5 px-2 font-body text-sm focus:border-teal focus:outline-none" />
                <input type="number" value={depositInputs[order.id] || ''} onChange={e => setDepositInputs(prev => ({ ...prev, [order.id]: e.target.value }))} placeholder="$0.00" min="0" step="0.01" className="flex-1 border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-teal focus:outline-none" />
                <button onClick={() => addDeposit(order.id)} disabled={!depositInputs[order.id] || savingAction === `deposit-${order.id}`} className="bg-teal text-white font-heading font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-teal/80 transition-colors">{savingAction === `deposit-${order.id}` ? '...' : '+ Agregar'}</button>
              </div>
            </div>

            {/* Transport */}
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-heading font-semibold text-sm text-gray-700">{'🚚'} Transporte</span>
                {order.transport_cost_confirmed !== null && <span className="font-heading font-bold text-sm text-orange">{formatCurrency(order.transport_cost_confirmed)}</span>}
              </div>
              <div className="flex gap-2">
                <input type="number" value={transportInputs[order.id] || (order.transport_cost_confirmed !== null ? String(order.transport_cost_confirmed) : '')} onChange={e => setTransportInputs(prev => ({ ...prev, [order.id]: e.target.value }))} placeholder="$0.00" min="0" step="0.01" className="flex-1 border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-orange focus:outline-none" />
                <button onClick={() => saveTransport(order.id)} disabled={!transportInputs[order.id] || savingAction === `transport-${order.id}`} className="bg-orange text-white font-heading font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-orange/80 transition-colors">{savingAction === `transport-${order.id}` ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
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
          <h3 className="font-heading font-bold text-purple mb-3">Resumen por Mes (Confirmados)</h3>
          <div className="space-y-2">
            {monthlySummary.map((m) => (
              <div key={m.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="font-heading font-bold text-gray-800">{m.label}</span>
                  <span className="text-gray-400 text-xs ml-2 font-body">{m.count} pedido{m.count !== 1 ? 's' : ''}</span>
                </div>
                <div className="text-right">
                  <p className="font-heading font-bold text-purple">{formatCurrency(m.total)}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 border-t-2 border-purple/20">
              <span className="font-heading font-bold text-purple">Total Confirmados</span>
              <div className="text-right">
                <p className="font-heading font-bold text-lg text-purple">{formatCurrency(confirmedRevenue)}</p>
                <p className="text-xs font-body text-gray-400">{confirmedOrders} pedido{confirmedOrders !== 1 ? 's' : ''}</p>
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
  const { showToast } = useToast();
  const [filter, setFilter] = useState('');
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', desc: '', price: '', cat: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', cat: 'planes', price: '', desc: '' });
  const [uploading, setUploading] = useState('');
  const [imageKeys, setImageKeys] = useState<Record<string, number>>({});
  const [imageGalleries, setImageGalleries] = useState<Record<string, string[]>>({});
  const [reorderMode, setReorderMode] = useState(false);

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

        const allProducts = [...merged, ...customMapped];

        // Apply saved order
        const savedOrder = await fetchSetting<string[]>('product_order');
        if (savedOrder && savedOrder.length > 0) {
          const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
          allProducts.sort((a, b) => {
            const ia = orderMap.get(a.id) ?? Infinity;
            const ib = orderMap.get(b.id) ?? Infinity;
            return ia - ib;
          });
        }

        setProducts(allProducts);

        // Load gallery images for all products
        const galleries: Record<string, string[]> = {};
        await Promise.all(allProducts.map(async (p) => {
          const imgs = await fetchProductImages(p.id);
          if (imgs.length > 0) galleries[p.id] = imgs;
        }));
        setImageGalleries(galleries);
      } catch {
        setProducts(builtIn);
      }
    }
    load();
  }, []);

  // ─── UPLOAD IMAGE ───
  const handleUpload = async (productId: string, file: File, imageIndex = 0) => {
    if (file.size > 2 * 1024 * 1024) {
      showToast('Foto muy grande. M\u00e1ximo 2MB');
      return;
    }
    setUploading(`${productId}-${imageIndex}`);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', productId);
      formData.append('folder', 'products');
      formData.append('imageIndex', String(imageIndex));
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken }, body: formData });
      if (res.ok) {
        const data = await res.json();
        const newUrl = data.path + '?t=' + Date.now();

        if (imageIndex === 0) {
          // Primary image — same as before
          setProducts(prev => prev.map(p => p.id === productId ? { ...p, imgUrl: newUrl } : p));
          setImageKeys(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
          const product = products.find(p => p.id === productId);
          if (product?.custom) {
            upsertCustomProduct({ id: productId, name: product.name, category: product.cat, price: product.price, description: product.desc, image_url: newUrl, active: product.active }).catch((e) => console.error('Save custom product error:', e));
          } else {
            upsertProductOverride({ id: productId, image_url: newUrl }).catch((e) => console.error('Save override error:', e));
          }
        }

        // Update gallery array (all 3 slots)
        const currentGallery = [...(imageGalleries[productId] || [])];
        while (currentGallery.length <= imageIndex) currentGallery.push('');
        currentGallery[imageIndex] = newUrl;
        // If slot 0 updated, also sync with product main image
        if (imageIndex === 0) {
          const product = products.find(p => p.id === productId);
          currentGallery[0] = product?.imgUrl || newUrl;
        }
        setImageGalleries(prev => ({ ...prev, [productId]: currentGallery }));
        // Save extra images (slots 1+2) to pt_settings
        upsertProductImages(productId, currentGallery).catch(e => console.error('Save gallery error:', e));

        showToast('Foto actualizada');
      } else { showToast('Error al subir foto'); }
    } catch (e) { console.error('Upload error:', e); showToast('Error de conexi\u00f3n'); }
    finally { setUploading(''); }
  };

  // ─── TOGGLE ACTIVE ───
  const toggleActive = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const nowActive = !product.active;
    setProducts(prev => prev.map(p => p.id === id ? { ...p, active: nowActive } : p));

    if (product.custom) {
      upsertCustomProduct({ id, name: product.name, category: product.cat, price: product.price, description: product.desc, image_url: product.imgUrl || null, active: nowActive }).catch((e) => { console.error('Toggle error:', e); showToast('Error al guardar'); });
    } else {
      upsertProductOverride({ id, disabled: !nowActive }).catch((e) => { console.error('Toggle error:', e); showToast('Error al guardar'); });
    }
    showToast(nowActive ? 'Producto activado' : 'Producto desactivado');
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
      upsertCustomProduct({ id, name: updated.name, category: updated.cat, price: updated.price, description: updated.desc, image_url: product.imgUrl || null, active: product.active }).catch((e) => { console.error('Save error:', e); showToast('Error al guardar'); });
    } else {
      upsertProductOverride({ id, name_override: updated.name, price_override: updated.price, description_override: updated.desc, category_override: updated.cat }).catch((e) => { console.error('Save error:', e); showToast('Error al guardar'); });
    }
    showToast('Producto guardado');
  };

  // ─── ADD PRODUCT ───
  const handleAddProduct = async () => {
    if (!newProduct.name.trim()) return;
    const id = `custom-${Date.now()}`;
    const product: AdminProduct = { id, name: newProduct.name, cat: newProduct.cat, price: Number(newProduct.price) || 0, desc: newProduct.desc, imgUrl: '', active: true, custom: true };
    setProducts(prev => [...prev, product]);
    upsertCustomProduct({ id, name: product.name, category: product.cat, price: product.price, description: product.desc, image_url: null, active: true }).catch((e) => { console.error('Add product error:', e); showToast('Error al guardar'); });
    setNewProduct({ name: '', cat: 'planes', price: '', desc: '' });
    setShowAdd(false);
    showToast('Producto agregado');
  };

  // ─── REMOVE CUSTOM PRODUCT ───
  const handleRemove = async (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    deleteCustomProduct(id).catch((e) => { console.error('Delete product error:', e); showToast('Error al eliminar'); });
    showToast('Producto eliminado');
  };

  const saveOrder = (newProducts: AdminProduct[]) => {
    upsertSetting('product_order', newProducts.map(p => p.id)).catch(e => console.error('Save order error:', e));
  };

  const moveProduct = (index: number, direction: 'up' | 'down') => {
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= products.length) return;
    const newProducts = [...products];
    [newProducts[index], newProducts[swap]] = [newProducts[swap], newProducts[index]];
    setProducts(newProducts);
    saveOrder(newProducts);
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
        <div className="flex gap-2">
          <button onClick={() => { setReorderMode(!reorderMode); if (reorderMode) showToast('Orden guardado'); }} className={`font-heading font-bold px-4 py-2 rounded-xl text-sm transition-colors ${reorderMode ? 'bg-teal text-white hover:bg-teal/80' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {reorderMode ? '\u2713 Listo' : '\u21C5 Ordenar'}
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="bg-purple text-white font-heading font-bold px-4 py-2 rounded-xl text-sm hover:bg-purple-light transition-colors">
            {showAdd ? 'Cancelar' : '+ Agregar'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className={`relative ${reorderMode ? 'opacity-50 pointer-events-none' : ''}`}>
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
      <div className={`flex gap-2 flex-wrap ${reorderMode ? 'opacity-50 pointer-events-none' : ''}`}>
        <button onClick={() => setFilter('')} className={`px-3 py-1 rounded-full text-xs font-heading font-semibold ${!filter ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600'}`}>Todos</button>
        {ALL_CATEGORIES.map(c => (
          <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1 rounded-full text-xs font-heading font-semibold ${filter === c ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600'}`}>{CATEGORIES.find(cat => cat.id === c)?.label || c}</button>
        ))}
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {(reorderMode ? products : filtered).map((product, productIndex) => {
          const isEditing = editingId === product.id;
          const imgSrc = product.imgUrl || `/images/products/${product.id}.png`;
          const fullIndex = reorderMode ? productIndex : products.indexOf(product);

          return (
            <div key={product.id} className={`bg-white rounded-xl border p-3 transition-opacity ${!product.active ? 'opacity-40 border-gray-200' : 'border-gray-100'}`}>
              {/* Collapsed view */}
              <div className="flex items-center gap-3">
                {/* Toggle or reorder arrows */}
                {reorderMode ? (
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button onClick={() => moveProduct(fullIndex, 'up')} disabled={fullIndex === 0} className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 hover:bg-purple/10 text-gray-500 hover:text-purple disabled:opacity-20 disabled:hover:bg-gray-100 disabled:hover:text-gray-500 transition-colors text-xs font-bold">{'\u2191'}</button>
                    <button onClick={() => moveProduct(fullIndex, 'down')} disabled={fullIndex === products.length - 1} className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 hover:bg-purple/10 text-gray-500 hover:text-purple disabled:opacity-20 disabled:hover:bg-gray-100 disabled:hover:text-gray-500 transition-colors text-xs font-bold">{'\u2193'}</button>
                  </div>
                ) : (
                  <button onClick={() => toggleActive(product.id)} className={`w-10 h-6 rounded-full flex-shrink-0 transition-colors relative ${!product.active ? 'bg-gray-300' : 'bg-teal'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${!product.active ? 'left-1' : 'left-5'}`} />
                  </button>
                )}

                {/* Image gallery (3 slots) */}
                <div className="flex gap-1 flex-shrink-0">
                  {[0, 1, 2].map(idx => {
                    const gallery = imageGalleries[product.id] || [];
                    const slotUrl = idx === 0 ? imgSrc : (gallery[idx] || '');
                    const isUploading = uploading === `${product.id}-${idx}`;
                    return (
                      <label key={idx} className={`${idx === 0 ? 'w-12 h-12' : 'w-8 h-8'} bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer relative group`}>
                        {slotUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={`${product.id}-${idx}-${imageKeys[product.id] || 0}`} src={slotUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs font-bold">+</div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className={`${idx === 0 ? 'w-4 h-4' : 'w-3 h-3'} text-white opacity-0 group-hover:opacity-100 transition-opacity`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </div>
                        <input type="file" accept="image/*" className="hidden" disabled={!!uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(product.id, f, idx); }} />
                        {isUploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><div className="w-3 h-3 border-2 border-purple border-t-transparent rounded-full animate-spin" /></div>}
                      </label>
                    );
                  })}
                </div>

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
  const { showToast } = useToast();
  const [categories, setCategories] = useState<{ id: string; label: string; icon: string; description: string; subtitle?: string }[]>([]);
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', emoji: '', description: '' });

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
    showToast('Categor\u00eda guardada');
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
              await upsertSetting('custom_categories', [...existing, item]);
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

function revalidateSite() {
  fetch('/api/revalidate', {
    method: 'POST',
    headers: { 'x-admin-token': _adminToken },
  }).catch(() => {});
}

function WebsiteTab() {
  const { showToast } = useToast();
  const [section, setSection] = useState<'homepage' | 'featured' | 'areas' | 'reels' | 'logo' | 'testimonials' | 'textos'>('homepage');
  const [savingSection, setSavingSection] = useState<string | null>(null);

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
    setSavingSection('homepage');
    try {
      await upsertSetting('homepage_content', hp);
      revalidateSite();
      showToast('Homepage guardado');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
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
    setSavingSection('featured');
    try {
      await upsertSetting('featured_products', featuredIds);
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
      await upsertSetting('event_areas', clean);
      setAreas(clean);
      revalidateSite();
      showToast('\u00c1reas guardadas');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  // ─── D) REELS (inline) ───
  const [reelUrls, setReelUrls] = useState(['', '', '']);

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
    if (file.size > 2 * 1024 * 1024) { showToast('Foto muy grande. M\u00e1ximo 2MB'); return; }
    if (!file.type.startsWith('image/')) { showToast('Solo se permiten im\u00e1genes'); return; }
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
        revalidateSite();
        showToast('Logo actualizado');
      } else { showToast('Error al subir logo'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setLogoUploading(false); }
  };

  const resetLogo = async () => {
    await upsertSetting('site_logo_url', null);
    setLogoUrl(null);
    revalidateSite();
    showToast('Logo tipogr\u00e1fico restaurado');
  };

  const extractReelIdLocal = (url: string) => { const m = url.match(/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/); return m ? m[1] : null; };

  const saveReels = async () => {
    setSavingSection('reels');
    try {
      const reels = reelUrls.filter(Boolean).map(url => { const id = extractReelIdLocal(url); return id ? { url, id } : null; }).filter(Boolean);
      await upsertSetting('reels', reels);
      revalidateSite();
      showToast('Reels guardados');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
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
      await upsertSetting('testimonials', clean);
      revalidateSite();
      showToast('Testimonios guardados');
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
      await upsertSetting('site_texts', overrides);
      clearSiteTextsCache();
      revalidateSite();
      showToast('Textos guardados');
    } catch { showToast('Error al guardar'); }
    finally { setSavingSection(null); }
  };

  const SUB_TABS: { key: typeof section; label: string }[] = [
    { key: 'homepage', label: 'Homepage' },
    { key: 'textos', label: 'Textos' },
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
          <button onClick={saveHomepage} disabled={savingSection === 'homepage'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'homepage' ? 'Guardando...' : 'Guardar Homepage'}</button>
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
                    <span className="font-body text-xs text-gray-400">{p.category} {'·'} {formatCurrency(p.price)}</span>
                  </div>
                </label>
              );
            })}
          </div>
          <button onClick={saveFeatured} disabled={savingSection === 'featured'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'featured' ? 'Guardando...' : 'Guardar Destacados'}</button>
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
            <button onClick={saveAreas} disabled={savingSection === 'areas'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'areas' ? 'Guardando...' : 'Guardar \u00c1reas'}</button>
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
          <button onClick={saveReels} disabled={savingSection === 'reels'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'reels' ? 'Guardando...' : 'Guardar Reels'}</button>
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
            <button onClick={saveTestimonials} disabled={savingSection === 'testimonials'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'testimonials' ? 'Guardando...' : 'Guardar Testimonios'}</button>
          </div>
        </div>
      )}

      {/* G) Site Texts */}
      {section === 'textos' && siteTextsLoaded && (
        <div className="space-y-4">
          <p className="font-body text-gray-500 text-sm">Edita los textos del carrito, checkout y dem{'á'}s p{'á'}ginas. Deja vac{'í'}o para usar el valor por defecto.</p>
          {(Object.keys(SITE_TEXT_LABELS) as (keyof SiteTexts)[]).map(key => (
            <div key={key}>
              <label className="block font-heading font-semibold text-xs text-gray-500 mb-1">{SITE_TEXT_LABELS[key]}</label>
              <input
                value={siteTexts[key] || ''}
                onChange={e => setSiteTexts(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={DEFAULT_SITE_TEXTS[key]}
                className={WI_CLS}
              />
              {siteTexts[key] !== DEFAULT_SITE_TEXTS[key] && siteTexts[key] && (
                <button onClick={() => setSiteTexts(prev => ({ ...prev, [key]: DEFAULT_SITE_TEXTS[key] }))} className="text-xs text-gray-400 hover:text-gray-600 mt-0.5 font-body">Restaurar valor por defecto</button>
              )}
            </div>
          ))}
          <button onClick={saveSiteTexts} disabled={savingSection === 'textos'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'textos' ? 'Guardando...' : 'Guardar Textos'}</button>
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
