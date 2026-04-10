'use client';

import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { formatCurrency } from '@/lib/format';
import { EVENT_AREAS } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import {
  fetchProductOverrides,
  fetchAllCustomProducts,
  fetchSetting,
  upsertSetting,
  fetchProductImages,
  upsertProductImages,
  fetchLogoUrl,
  fetchDBProducts,
  fetchDBProductVariants,
  DBProduct,
  DBProductVariant,
} from '@/lib/supabase-data';

// ─── API helpers (server-side writes via service role) ───
function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-admin-token': _adminToken, 'x-admin-pin': _adminPin, ...extra };
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
import { PRODUCTS, CATEGORIES } from '@/lib/constants';
import { DEFAULT_SITE_TEXTS, SITE_TEXT_LABELS, SiteTexts, clearSiteTextsCache } from '@/lib/site-texts';
import { downloadOrderPDF } from '@/lib/pdf-order';

type OrderStatus = 'pendiente' | 'confirmado' | 'realizado' | 'rechazado';
const ORDER_STATUSES: { key: OrderStatus; label: string; color: string; bg: string }[] = [
  { key: 'pendiente', label: 'Pendiente', color: 'text-gray-600', bg: 'bg-gray-200' },
  { key: 'confirmado', label: 'Confirmado', color: 'text-white', bg: 'bg-teal' },
  { key: 'realizado', label: 'Realizado', color: 'text-white', bg: 'bg-purple' },
  { key: 'rechazado', label: 'Rechazado', color: 'text-white', bg: 'bg-red-500' },
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

// Session token stored after server-side auth validation
let _adminToken = '';
// Keep PIN for backward compat with API headers
let _adminPin = '';
// Role: 'admin' has full access, 'vendedora' sees only Pedidos (no stats)
let _adminRole: 'admin' | 'vendedora' = 'admin';

function round2(n: number) { return Math.round(n * 100) / 100; }

// ─── ORDERS TAB ───
const OI_CLS = 'w-full border border-gray-200 rounded-lg py-2 px-3 font-body text-sm focus:border-purple focus:outline-none';

function fmtTime12h(t: string) {
  try {
    const [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${ap}`;
  } catch { return t; }
}


interface OrderCardProps {
  order: Order;
  isExpanded: boolean;
  onToggleExpand: () => void;
  patchOrder: (body: Record<string, unknown>) => Promise<boolean>;
  fetchOrders: () => Promise<void>;
  onDeleteOrder: (orderId: number, orderNumber: number) => void;
  onSetStatus: (orderId: number, status: OrderStatus) => void;
  onUpdateOrder: (orderId: number, updates: Partial<Order>) => void;
  allProducts: { id: string; name: string; price: number }[];
}

const OrderCard = memo(function OrderCard({ order, isExpanded, onToggleExpand, patchOrder, fetchOrders, onDeleteOrder, onSetStatus, onUpdateOrder, allProducts }: OrderCardProps) {
  const { showToast } = useToast();

  // Local state (previously in OrdersTab, keyed by orderId)
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [itemEdits, setItemEdits] = useState<Record<number, { quantity: string; unit_price: string }>>({});
  const [newItemForm, setNewItemForm] = useState<{ name: string; qty: string; price: string }>({ name: '', qty: '1', price: '' });
  const [productSuggestions, setProductSuggestions] = useState<typeof PRODUCTS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [transportInput, setTransportInput] = useState('');
  const [isEditingTransport, setIsEditingTransport] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [depositInput, setDepositInput] = useState('');
  const [depositDate, setDepositDate] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [savingAction, setSavingAction] = useState<string | null>(null);

  const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Reset local edit state when card collapses
  useEffect(() => {
    if (!isExpanded) {
      setIsEditing(false);
      setIsEditingItems(false);
      setShowMoreMenu(false);
    }
  }, [isExpanded]);

  // ─── Handlers ───

  const saveNote = async () => {
    const text = noteInput.trim();
    if (!text) return;
    setSavingAction('note');
    try {
      if (await patchOrder({ orderId: order.id, internalNote: text })) {
        onUpdateOrder(order.id, { internal_note: text });
        setNoteInput('');
        showToast('Nota guardada');
      } else { showToast('Error al guardar nota'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const startEditOrder = () => {
    setIsEditing(true);
    setEditForm({
      customer_name: order.customer_name, customer_phone: order.customer_phone, customer_email: order.customer_email || '',
      event_date: order.event_date, event_time: order.event_time, event_area: order.event_area || '', event_address: order.event_address,
      birthday_child_name: order.birthday_child_name || '', birthday_child_age: order.birthday_child_age ? String(order.birthday_child_age) : '',
      notes: order.notes || '',
    });
  };

  const saveEditOrder = async () => {
    const f = editForm;
    if (!f.customer_name?.trim()) { showToast('Nombre requerido'); return; }
    const phoneDigits = (f.customer_phone || '').replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) { showToast('Tel\u00e9fono inv\u00e1lido (7-15 d\u00edgitos)'); return; }
    const editFields = {
      customer_name: f.customer_name, customer_phone: f.customer_phone, customer_email: f.customer_email,
      event_date: f.event_date, event_time: f.event_time, event_area: f.event_area, event_address: f.event_address,
      birthday_child_name: f.birthday_child_name, birthday_child_age: f.birthday_child_age ? Number(f.birthday_child_age) : null,
      notes: f.notes,
    };
    setSavingAction('edit');
    try {
      if (await patchOrder({ orderId: order.id, editFields })) {
        onUpdateOrder(order.id, {
          customer_name: f.customer_name, customer_phone: f.customer_phone, customer_email: f.customer_email || null,
          event_date: f.event_date, event_time: f.event_time, event_area: f.event_area || null, event_address: f.event_address,
          birthday_child_name: f.birthday_child_name || null, birthday_child_age: f.birthday_child_age ? Number(f.birthday_child_age) : null,
          notes: f.notes || null,
        });
        setIsEditing(false);
        showToast('Pedido actualizado');
      } else { showToast('Error al guardar cambios'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const addDeposit = async () => {
    const val = Number(depositInput);
    if (isNaN(val) || val <= 0) return;
    const date = depositDate || new Date().toISOString().slice(0, 10);
    const newDeposits = [...(order.deposits || []), { amount: val, date }];
    const totalDep = newDeposits.reduce((s, d) => s + d.amount, 0);
    setSavingAction('deposit');
    try {
      if (await patchOrder({ orderId: order.id, deposits: newDeposits, depositAmount: totalDep })) {
        onUpdateOrder(order.id, { deposits: newDeposits, deposit_amount: totalDep });
        setDepositInput('');
        showToast('Dep\u00f3sito agregado');
      } else { showToast('Error al guardar dep\u00f3sito'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const removeDeposit = async (index: number) => {
    const newDeposits = (order.deposits || []).filter((_, i) => i !== index);
    const totalDep = newDeposits.reduce((s, d) => s + d.amount, 0);
    setSavingAction('deposit');
    try {
      if (await patchOrder({ orderId: order.id, deposits: newDeposits, depositAmount: totalDep })) {
        onUpdateOrder(order.id, { deposits: newDeposits, deposit_amount: totalDep });
        showToast('Dep\u00f3sito eliminado');
      } else { showToast('Error al eliminar dep\u00f3sito'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const saveDiscount = async (overrideVal?: number, overrideType?: 'fixed' | 'percent') => {
    const val = overrideVal !== undefined ? overrideVal : Number(discountInput);
    if (isNaN(val) || val < 0) return;
    const dtype = overrideType !== undefined ? overrideType : discountType;
    if (dtype === 'percent' && val > 100) return;
    setSavingAction('discount');
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken },
        body: JSON.stringify({ orderId: order.id, discount: val, discountType: dtype }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdateOrder(order.id, {
          discount: val, discount_type: dtype,
          ...(data.total !== undefined ? { subtotal: data.subtotal, surcharge: data.surcharge, total: data.total } : {}),
        });
        setDiscountInput('');
        showToast('Descuento guardado');
      } else { showToast('Error al guardar descuento'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const startEditItems = () => {
    setIsEditingItems(true);
    const edits: Record<number, { quantity: string; unit_price: string }> = {};
    for (const item of order.items) {
      if (item.id) edits[item.id] = { quantity: String(item.quantity), unit_price: String(item.unit_price) };
    }
    setItemEdits(edits);
    setNewItemForm({ name: '', qty: '1', price: '' });
  };

  const saveItemEdits = async () => {
    const editItems = Object.entries(itemEdits).map(([id, vals]) => ({
      id: Number(id),
      quantity: Number(vals.quantity) || 1,
      unit_price: Number(vals.unit_price) || 0,
    }));
    setSavingAction('items');
    try {
      if (await patchOrder({ orderId: order.id, editItems })) {
        await fetchOrders();
        setIsEditingItems(false);
        showToast('Items actualizados');
      } else { showToast('Error al guardar items'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const handleAddItem = async () => {
    if (!newItemForm.name.trim() || !newItemForm.price) return;
    setSavingAction('additem');
    try {
      if (await patchOrder({ orderId: order.id, addItem: { product_name: newItemForm.name, quantity: Number(newItemForm.qty) || 1, unit_price: Number(newItemForm.price) || 0 } })) {
        const pendingEdits = Object.entries(itemEdits).map(([id, vals]) => ({
          id: Number(id),
          quantity: Number(vals.quantity) || 1,
          unit_price: Number(vals.unit_price) || 0,
        }));
        if (pendingEdits.length > 0) {
          await patchOrder({ orderId: order.id, editItems: pendingEdits });
        }
        await fetchOrders();
        setIsEditingItems(false);
        setNewItemForm({ name: '', qty: '1', price: '' });
        showToast('Item agregado');
      } else { showToast('Error al agregar item'); }
    } catch { showToast('Error al agregar'); }
    finally { setSavingAction(null); }
  };

  const handleRemoveItem = async (itemId: number) => {
    if (!window.confirm('\u00bfEliminar este item?')) return;
    setSavingAction('removeitem');
    try {
      if (await patchOrder({ orderId: order.id, removeItem: itemId })) {
        await fetchOrders();
        showToast('Item eliminado');
      } else { showToast('Error al eliminar item'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  const saveTransport = async () => {
    const val = Number(transportInput);
    if (isNaN(val) || val < 0) return;
    setSavingAction('transport');
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken },
        body: JSON.stringify({ orderId: order.id, transportCostConfirmed: val }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdateOrder(order.id, {
          transport_cost_confirmed: val,
          ...(data.total !== undefined ? { subtotal: data.subtotal, surcharge: data.surcharge, total: data.total } : {}),
        });
        setTransportInput('');
        showToast('Transporte confirmado');
      } else { showToast('Error al confirmar transporte'); }
    } catch { showToast('Error de conexi\u00f3n'); }
    finally { setSavingAction(null); }
  };

  // ─── Computed values ───
  const st = getOrderStatus(order);
  const stInfo = ORDER_STATUSES.find(s => s.key === st) || ORDER_STATUSES[0];
  const ef = editForm;
  const deposits = order.deposits || [];
  const totalDeposits = deposits.reduce((s, d) => s + d.amount, 0) || (order.deposit_amount ?? 0);
  const areaSuggestion = order.transport_cost_confirmed === null && order.event_area
    ? EVENT_AREAS.find(a => a.name === order.event_area)?.price
    : undefined;

  // Live-calculated totals (single source of truth)
  const liveItemsTotal = order.items.reduce((s, i) => {
    if (isEditingItems && i.id && itemEdits[i.id]) {
      return s + (Number(itemEdits[i.id].unit_price) || 0) * (Number(itemEdits[i.id].quantity) || 1);
    }
    return s + i.unit_price * i.quantity;
  }, 0);
  const liveDiscRaw = order.discount || 0;
  const liveDisc = order.discount_type === 'percent' ? round2(liveItemsTotal * liveDiscRaw / 100) : liveDiscRaw;
  const liveTrans = order.transport_cost_confirmed ?? 0;
  const liveBase = liveItemsTotal - liveDisc + (liveTrans > 0 ? liveTrans : 0);
  const liveSurch = order.payment_method === 'credit_card' ? liveBase * 0.05 : 0;
  const liveTotal = liveBase + liveSurch;
  const payMethodLabel = order.payment_method === 'credit_card' ? 'Tarjeta (+5%)' : 'Transferencia';

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${st === 'pendiente' ? 'border-gray-100' : st === 'confirmado' ? 'border-teal/30' : st === 'rechazado' ? 'border-red-200' : 'border-purple/30'}`}>
      {/* ─── HEADER (collapsed card) ─── */}
      <button onClick={() => { onToggleExpand(); if (isEditing) setIsEditing(false); setShowMoreMenu(false); }} className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-heading font-semibold px-2 py-0.5 rounded-full text-white ${stInfo.bg}`}>{stInfo.label}</span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-bold text-purple">#{order.order_number}</span>
                {totalDeposits > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-teal/10 text-teal font-semibold">{'\uD83D\uDCB0'}</span>}
                {liveDisc > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-green-50 text-green-600 font-semibold">{'\uD83C\uDFF7\uFE0F'}</span>}
                {order.transport_cost_confirmed === null && <span className="text-[9px] px-1 py-0.5 rounded bg-orange/10 text-orange font-semibold">{'\uD83D\uDE9A?'}</span>}
              </div>
              <p className="font-body text-gray-700 text-sm mt-0.5">{order.customer_name} {'\u00b7'} {order.event_date}</p>
            </div>
          </div>
          <span className="font-heading font-bold text-lg text-purple">{formatCurrency(liveTotal)}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50/50 space-y-3">
          {/* ─── 1. PIPELINE ─── */}
          <div className="flex gap-1">
            {ORDER_STATUSES.map(s => (
              <button key={s.key} onClick={() => onSetStatus(order.id, s.key)}
                disabled={savingAction === 'status'}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-heading font-semibold transition-all disabled:opacity-50 ${st === s.key ? `${s.bg} text-white` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              >{s.label}</button>
            ))}
          </div>

          {/* ─── 2. ACTIONS (neutral colors, delete in overflow) ─── */}
          <div className="flex gap-2 items-center">
            <a href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 font-heading font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </a>
            {!isEditing && <button onClick={() => startEditOrder()} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 hover:bg-gray-200 font-heading font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors">Editar</button>}
            {isEditing && <button onClick={() => setIsEditing(false)} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 hover:bg-gray-200 font-heading font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors">Cancelar</button>}
            <button onClick={async () => {
              const theme = order.notes?.replace(/^Tema:\s*/, '') || '';
              const logoUrl = await fetchLogoUrl().catch(() => null);
              const pdfTransport = order.transport_cost_confirmed ?? (order.event_area ? (EVENT_AREAS.find(a => a.name === order.event_area)?.price ?? 0) : 0);
              const pdfBase = liveItemsTotal - liveDisc + pdfTransport;
              const pdfSurch = order.payment_method === 'credit_card' ? pdfBase * 0.05 : 0;
              const pdfTotal = pdfBase + pdfSurch;
              await downloadOrderPDF({ orderNumber: order.order_number, customer: { name: order.customer_name, phone: order.customer_phone, email: order.customer_email || '' }, event: { date: order.event_date, time: order.event_time, area: order.event_area || '', address: order.event_address, birthdayChildName: order.birthday_child_name || '', birthdayChildAge: order.birthday_child_age || '', theme }, items: order.items.map(i => ({ productId: '', name: i.product_name, category: '' as never, quantity: i.quantity, unitPrice: i.unit_price })), subtotal: liveItemsTotal, discount: liveDisc, discountType: order.discount_type, transportCost: pdfTransport, surcharge: pdfSurch, total: pdfTotal, paymentMethod: order.payment_method as 'bank_transfer' | 'credit_card', logoUrl, deposits });
              showToast('PDF descargado');
            }} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 hover:bg-gray-200 font-heading font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors">PDF</button>
            {/* Overflow menu with delete */}
            <div className="relative ml-auto">
              <button onClick={() => setShowMoreMenu(!showMoreMenu)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><circle cx="4" cy="10" r="2"/><circle cx="10" cy="10" r="2"/><circle cx="16" cy="10" r="2"/></svg>
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-[160px]">
                  <button onClick={() => { setShowMoreMenu(false); onDeleteOrder(order.id, order.order_number); }} disabled={savingAction === 'delete'} className="w-full text-left px-3 py-2 text-sm font-body text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">Eliminar pedido</button>
                </div>
              )}
            </div>
          </div>

          {/* ─── 3. DETAILS (edit form or read-only) ─── */}
          {isEditing ? (
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
              {/* Cliente */}
              <div>
                <p className="font-heading font-semibold text-xs text-gray-400 uppercase mb-2">Cliente</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={ef.customer_name || ''} onChange={e => setEditForm(p => ({ ...p, customer_name: e.target.value }))} placeholder="Nombre" className={OI_CLS} />
                  <input value={ef.customer_phone || ''} onChange={e => setEditForm(p => ({ ...p, customer_phone: e.target.value }))} placeholder="Tel\u00e9fono" className={`${OI_CLS} ${(ef.customer_phone || '').replace(/\D/g, '').length < 7 && (ef.customer_phone || '').length > 0 ? 'border-red-300 focus:border-red-500' : ''}`} />
                </div>
                <input value={ef.customer_email || ''} onChange={e => setEditForm(p => ({ ...p, customer_email: e.target.value }))} placeholder="Email (opcional)" className={`${OI_CLS} mt-2`} />
              </div>
              {/* Evento */}
              <div>
                <p className="font-heading font-semibold text-xs text-gray-400 uppercase mb-2">Evento</p>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input type="date" value={ef.event_date || ''} onChange={e => setEditForm(p => ({ ...p, event_date: e.target.value }))} className={OI_CLS} />
                  {(() => {
                    const raw = ef.event_time || '12:00';
                    const [hh, mm] = raw.split(':').map(Number);
                    const ap = hh >= 12 ? 'PM' : 'AM';
                    const hr12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
                    const buildTime = (h: number, m: number, ampm: string) => {
                      let h24 = h;
                      if (ampm === 'AM' && h === 12) h24 = 0;
                      else if (ampm === 'PM' && h !== 12) h24 = h + 12;
                      return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    };
                    return (
                      <div className="flex gap-1">
                        <select value={hr12} onChange={e => setEditForm(p => ({ ...p, event_time: buildTime(Number(e.target.value), mm, ap) }))} className="border border-gray-200 rounded-lg py-2 px-2 font-body text-sm focus:border-purple focus:outline-none w-16">
                          {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <select value={mm} onChange={e => setEditForm(p => ({ ...p, event_time: buildTime(hr12, Number(e.target.value), ap) }))} className="border border-gray-200 rounded-lg py-2 px-1.5 font-body text-sm focus:border-purple focus:outline-none w-16">
                          {[0,15,30,45].map(m => <option key={m} value={m}>:{String(m).padStart(2,'0')}</option>)}
                        </select>
                        <select value={ap} onChange={e => setEditForm(p => ({ ...p, event_time: buildTime(hr12, mm, e.target.value) }))} className="border border-gray-200 rounded-lg py-2 px-1.5 font-body text-sm focus:border-purple focus:outline-none w-16">
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <select value={ef.event_area || ''} onChange={e => setEditForm(p => ({ ...p, event_area: e.target.value }))} className={OI_CLS}>
                    <option value="">{'\u00c1'}rea</option>
                    {EVENT_AREAS.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                  </select>
                  <input value={ef.event_address || ''} onChange={e => setEditForm(p => ({ ...p, event_address: e.target.value }))} placeholder="Direcci\u00f3n" className={OI_CLS} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <input value={ef.birthday_child_name || ''} onChange={e => setEditForm(p => ({ ...p, birthday_child_name: e.target.value }))} placeholder="Cumplea\u00f1ero" className={OI_CLS} />
                  <input type="number" value={ef.birthday_child_age || ''} onChange={e => setEditForm(p => ({ ...p, birthday_child_age: e.target.value }))} placeholder="Edad" className={OI_CLS} />
                  <input value={ef.notes || ''} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="Tema/Notas" className={OI_CLS} />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setIsEditing(false)} disabled={savingAction === 'edit'} className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">Cancelar</button>
                <button onClick={() => saveEditOrder()} disabled={savingAction === 'edit'} className="flex-1 bg-purple text-white font-heading font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">{savingAction === 'edit' ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><span className="text-gray-400 font-heading text-[10px] uppercase">Tel</span><br/><a href={`tel:${order.customer_phone}`} className="text-teal font-body">{order.customer_phone}</a></div>
                <div><span className="text-gray-400 font-heading text-[10px] uppercase">Hora</span><br/><span className="font-body">{fmtTime12h(order.event_time)}</span></div>
                {order.event_area && <div><span className="text-gray-400 font-heading text-[10px] uppercase">{'\u00c1'}rea</span><br/><span className="font-body">{order.event_area}</span></div>}
                <div><span className="text-gray-400 font-heading text-[10px] uppercase">Pago</span><br/><span className="font-body">{payMethodLabel}</span></div>
                <div className="col-span-2"><span className="text-gray-400 font-heading text-[10px] uppercase">Lugar</span><br/><span className="font-body">{order.event_address}</span></div>
                {order.birthday_child_name && <div className="col-span-2"><span className="text-gray-400 font-heading text-[10px] uppercase">Cumplea{'\u00f1'}ero/a</span><br/><span className="font-body">{order.birthday_child_name}{order.birthday_child_age ? ` (${order.birthday_child_age} a\u00f1os)` : ''}</span></div>}
                {order.notes && <div className="col-span-2"><span className="text-gray-400 font-heading text-[10px] uppercase">Notas</span><br/><span className="font-body">{order.notes}</span></div>}
              </div>
            </div>
          )}

          {/* ─── 4. FACTURA UNIFICADA (items + descuento + transporte + total) ─── */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
              <span className="font-heading font-semibold text-xs text-gray-500 uppercase">Factura</span>
              {isEditingItems ? (
                <div className="flex gap-2">
                  <button onClick={() => setIsEditingItems(false)} className="text-xs text-gray-500 font-heading font-semibold hover:text-gray-700">Cancelar</button>
                  <button onClick={() => saveItemEdits()} disabled={savingAction === 'items'} className="text-xs text-purple font-heading font-semibold hover:text-purple/80">{savingAction === 'items' ? 'Guardando...' : 'Guardar'}</button>
                </div>
              ) : (
                <button onClick={() => startEditItems()} className="text-xs text-purple font-heading font-semibold hover:underline">Editar</button>
              )}
            </div>
            {/* Items */}
            <div className="divide-y divide-gray-100">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between px-3 py-2.5 text-sm gap-2">
                  {isEditingItems && item.id ? (
                    <>
                      <span className="flex-1 truncate text-gray-700 text-xs">{item.product_name}</span>
                      <input type="number" value={itemEdits[item.id]?.quantity || ''} onChange={e => setItemEdits(prev => ({ ...prev, [item.id!]: { ...prev[item.id!], quantity: e.target.value } }))} className="w-12 border border-gray-200 rounded px-1 py-0.5 text-center text-xs" min="1" />
                      <span className="text-gray-400 text-xs">x</span>
                      <input type="number" value={itemEdits[item.id]?.unit_price || ''} onChange={e => setItemEdits(prev => ({ ...prev, [item.id!]: { ...prev[item.id!], unit_price: e.target.value } }))} className="w-20 border border-gray-200 rounded px-1 py-0.5 text-right text-xs" min="0" step="0.01" />
                      <span className="text-xs text-gray-400 w-16 text-right">{formatCurrency((Number(itemEdits[item.id]?.quantity) || 1) * (Number(itemEdits[item.id]?.unit_price) || 0))}</span>
                      <button onClick={() => handleRemoveItem(item.id!)} className="text-gray-300 hover:text-red-500 ml-1"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </>
                  ) : (
                    <>
                      <span className="text-gray-700 font-body">{item.product_name} <span className="text-gray-400">x{item.quantity}</span></span>
                      <span className="font-heading font-semibold">{formatCurrency(item.line_total)}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            {/* Add item (when editing) */}
            {isEditingItems && (
              <div className="border-t border-gray-200 px-3 py-2.5 bg-gray-50/50 space-y-2">
                <p className="text-xs font-heading font-semibold text-gray-500">Agregar item</p>
                <div className="flex gap-1">
                  <div className="flex-1 relative">
                    <input type="text" value={newItemForm.name}
                      onChange={e => { const q = e.target.value; setNewItemForm(p => ({ ...p, name: q })); if (q.trim().length >= 2) { setProductSuggestions(allProducts.filter(p => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) as typeof PRODUCTS); setShowSuggestions(true); } else { setShowSuggestions(false); } }}
                      onFocus={() => { if (newItemForm.name.trim().length >= 2) setShowSuggestions(true); }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Buscar producto..." className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs font-body" />
                    {showSuggestions && productSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 mt-0.5 max-h-48 overflow-y-auto">
                        {productSuggestions.map(p => (
                          <button key={p.id} type="button" onMouseDown={() => { setNewItemForm({ name: p.name, qty: '1', price: String(p.price) }); setShowSuggestions(false); }} className="w-full text-left px-3 py-2.5 hover:bg-purple/5 text-xs font-body flex justify-between gap-2 min-h-[44px] items-center">
                            <span className="truncate text-gray-700">{p.name}</span>
                            <span className="text-purple font-heading font-semibold shrink-0">${p.price}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input type="number" value={newItemForm.qty} onChange={e => setNewItemForm(p => ({ ...p, qty: e.target.value }))} placeholder="Qty" className="w-12 border border-gray-200 rounded px-1 py-1.5 text-center text-xs" min="1" />
                  <input type="number" value={newItemForm.price} onChange={e => setNewItemForm(p => ({ ...p, price: e.target.value }))} placeholder="$" className="w-20 border border-gray-200 rounded px-1 py-1.5 text-right text-xs" min="0" step="0.01" />
                  <button onClick={() => handleAddItem()} disabled={!newItemForm.name.trim() || !newItemForm.price || savingAction === 'additem'} className="bg-purple text-white font-heading font-semibold px-2.5 py-1.5 rounded text-xs disabled:opacity-40">+</button>
                </div>
              </div>
            )}
            {/* ─── TOTALS + INLINE DISCOUNT/TRANSPORT ─── */}
            <div className="border-t border-gray-200 px-3 py-3 space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Subtotal</span>
                <span className="font-heading">{formatCurrency(liveItemsTotal)}</span>
              </div>
              {/* Discount (inline editable) */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Descuento</span>
                {liveDisc > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <span className="font-heading font-semibold text-green-600">-{formatCurrency(liveDisc)}{order.discount_type === 'percent' ? ` (${order.discount}%)` : ''}</span>
                    <button onClick={() => { saveDiscount(0, 'fixed'); }} className="text-gray-300 hover:text-red-400"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <div className="flex border border-gray-200 rounded overflow-hidden">
                      <button onClick={() => setDiscountType('fixed')} className={`px-1.5 py-1 text-[10px] font-heading font-semibold ${discountType === 'fixed' ? 'bg-purple text-white' : 'bg-gray-50 text-gray-400'}`}>$</button>
                      <button onClick={() => setDiscountType('percent')} className={`px-1.5 py-1 text-[10px] font-heading font-semibold ${discountType === 'percent' ? 'bg-purple text-white' : 'bg-gray-50 text-gray-400'}`}>%</button>
                    </div>
                    <input type="number" value={discountInput} onChange={e => setDiscountInput(e.target.value)} placeholder={discountType === 'percent' ? '10' : '$0'} min="0" max={discountType === 'percent' ? '100' : undefined} step={discountType === 'percent' ? '1' : '0.01'} className="w-16 border border-gray-200 rounded px-2 py-1 text-right text-xs font-body focus:border-purple focus:outline-none" />
                    {discountInput && <button onClick={() => saveDiscount()} disabled={savingAction === 'discount'} className="text-[10px] font-heading font-semibold text-purple hover:underline disabled:opacity-50">{savingAction === 'discount' ? '...' : 'Aplicar'}</button>}
                  </div>
                )}
              </div>
              {/* Transport (inline editable) */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Transporte</span>
                {order.transport_cost_confirmed !== null && !isEditingTransport ? (
                  <div className="flex items-center gap-1.5">
                    <span className={`font-heading font-semibold ${liveTrans > 0 ? 'text-gray-700' : 'text-gray-400'}`}>{liveTrans > 0 ? formatCurrency(liveTrans) : '$0 (gratis)'}</span>
                    <button onClick={() => { setIsEditingTransport(true); setTransportInput(String(liveTrans)); }} className="text-gray-300 hover:text-orange"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <input type="number" value={transportInput || (areaSuggestion !== undefined ? String(areaSuggestion) : '')} onChange={e => setTransportInput(e.target.value)} placeholder={areaSuggestion !== undefined ? `$${areaSuggestion} sugerido` : '$0'} min="0" step="0.01" className="w-24 border border-orange/40 rounded px-2 py-1 text-right text-xs font-body focus:border-orange focus:outline-none bg-orange/5" />
                    <button onClick={() => { saveTransport(); setIsEditingTransport(false); }} disabled={!transportInput || savingAction === 'transport'} className="text-[10px] font-heading font-semibold text-orange hover:underline disabled:opacity-50">{savingAction === 'transport' ? '...' : 'Confirmar'}</button>
                    {isEditingTransport && <button onClick={() => setIsEditingTransport(false)} className="text-gray-300 hover:text-gray-500"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>}
                  </div>
                )}
              </div>
              {/* Surcharge */}
              {liveSurch > 0 && (
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Recargo tarjeta (5%)</span>
                  <span className="font-heading">{formatCurrency(liveSurch)}</span>
                </div>
              )}
              {/* Payment method */}
              <div className="flex justify-between text-xs text-gray-400">
                <span>M{'é'}todo</span>
                <span className="font-heading">{payMethodLabel}</span>
              </div>
              {/* Total */}
              <div className="flex justify-between text-sm font-heading font-bold text-purple border-t border-gray-100 pt-2 mt-1">
                <span>Total</span>
                <span>{formatCurrency(liveTotal)}</span>
              </div>
            </div>
          </div>

          {/* ─── 5. DEPÓSITOS (simplified, with progress bar) ─── */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button onClick={() => toggleSection('dep')} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
              <span className="font-heading font-semibold text-xs text-gray-500">{'\uD83D\uDCB0'} Dep{'ó'}sitos</span>
              <div className="flex items-center gap-3 text-xs">
                {totalDeposits > 0 && <span className="text-teal font-heading font-semibold">{formatCurrency(totalDeposits)}</span>}
                {totalDeposits > 0 && <span className="text-purple font-heading font-bold">Saldo: {formatCurrency(Math.max(0, liveTotal - totalDeposits))}</span>}
                <span className="text-gray-400">{openSections['dep'] ? '\u25BE' : '\u25B8'}</span>
              </div>
            </button>
            {totalDeposits > 0 && (
              <div className="px-3 pt-1 pb-0"><div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-teal h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, liveTotal > 0 ? (totalDeposits / liveTotal) * 100 : 0)}%` }} /></div></div>
            )}
            {openSections['dep'] && (
              <div className="p-3 space-y-2">
                {deposits.length > 0 && (
                  <div className="space-y-1">
                    {deposits.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-teal/5 rounded-lg px-2.5 py-1.5">
                        <span className="font-body text-gray-600">{d.date}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-heading font-semibold text-teal">{formatCurrency(d.amount)}</span>
                          <button onClick={() => removeDeposit(i)} className="text-gray-300 hover:text-red-500 text-xs">{'\u2715'}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {totalDeposits > 0 && <p className="font-body text-xs text-gray-500">Saldo pendiente: <span className="font-semibold text-purple">{formatCurrency(Math.max(0, liveTotal - totalDeposits))}</span></p>}
                <div className="flex gap-2">
                  <input type="date" value={depositDate || new Date().toISOString().slice(0, 10)} onChange={e => setDepositDate(e.target.value)} className="border border-gray-200 rounded-lg py-1.5 px-2 font-body text-sm focus:border-teal focus:outline-none" />
                  <input type="number" value={depositInput} onChange={e => setDepositInput(e.target.value)} placeholder={liveTotal > 0 ? formatCurrency(liveTotal) : '$0.00'} min="0" step="0.01" className="flex-1 border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-teal focus:outline-none" />
                  <button onClick={() => addDeposit()} disabled={!depositInput || savingAction === 'deposit'} className="bg-teal text-white font-heading font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-teal/80 transition-colors">{savingAction === 'deposit' ? '...' : '+'}</button>
                </div>
              </div>
            )}
          </div>

          {/* ─── 6. NOTA INTERNA ─── */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button onClick={() => toggleSection('note')} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors">
              <span className="font-heading font-semibold text-xs text-gray-500">{'\uD83D\uDCDD'} Nota interna {order.internal_note ? '(1)' : ''}</span>
              <span className="text-gray-400 text-xs">{openSections['note'] ? '\u25BE' : '\u25B8'}</span>
            </button>
            {openSections['note'] && (
              <div className="px-3 pb-3 space-y-2">
                {order.internal_note && <p className="font-body text-sm text-gray-700 bg-gray-50 rounded-lg px-2.5 py-2">{order.internal_note}</p>}
                <div className="flex gap-2">
                  <input type="text" value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="Agregar nota interna..." className="flex-1 border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none" />
                  <button onClick={() => saveNote()} disabled={!noteInput.trim() || savingAction === 'note'} className="bg-purple text-white font-heading font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-purple/80 transition-colors">{savingAction === 'note' ? '...' : 'Guardar'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

function OrdersTab() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'rejected'>('all');
  const [sortMode, setSortMode] = useState<'created' | 'event'>('created');
  const [allProducts, setAllProducts] = useState<{ id: string; name: string; price: number }[]>(
    PRODUCTS.map(p => ({ id: p.id, name: p.name, price: p.price }))
  );

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
      setError('No se pudieron cargar los pedidos. Verifica que Supabase est\u00e9 configurado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    async function loadAllProducts() {
      try {
        const [overrides, custom] = await Promise.all([fetchProductOverrides(), fetchAllCustomProducts()]);
        const ovMap = new Map(overrides.map(o => [o.id, o]));
        const merged = PRODUCTS.map(p => {
          const ov = ovMap.get(p.id);
          return { id: p.id, name: ov?.name_override || p.name, price: ov?.price_override ?? p.price };
        });
        const customMapped = custom.map(cp => ({ id: cp.id, name: cp.name, price: cp.price }));
        setAllProducts([...merged, ...customMapped]);
      } catch { /* fallback: keep PRODUCTS */ }
    }
    loadAllProducts();
  }, []);

  const setOrderStatus = useCallback(async (orderId: number, newStatus: OrderStatus) => {
    const confirmed = newStatus === 'confirmado' || newStatus === 'realizado';
    const label = ORDER_STATUSES.find(s => s.key === newStatus)?.label || newStatus;
    try {
      if (await patchOrder({ orderId, status: newStatus })) {
        setOrders(prev => {
          const current = prev.find(o => o.id === orderId);
          if (current && getOrderStatus(current) === newStatus) return prev;
          return prev.map(o => o.id === orderId ? { ...o, status: newStatus, confirmed } : o);
        });
        showToast(`Estado: ${label}`);
      } else { showToast('Error al cambiar estado'); }
    } catch { showToast('Error de conexi\u00f3n'); }
  }, [patchOrder, showToast]);

  const deleteOrder = useCallback(async (orderId: number, orderNumber: number) => {
    if (!window.confirm(`\u00bfEliminar pedido #${orderNumber}? Esta acci\u00f3n no se puede deshacer.`)) return;
    try {
      const res = await fetch('/api/orders', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken }, body: JSON.stringify({ orderId }) });
      if (res.ok) { setOrders(prev => prev.filter(o => o.id !== orderId)); setExpandedOrder(null); showToast('Pedido eliminado'); }
      else { showToast('Error al eliminar pedido'); }
    } catch (e) {
      console.error('Delete order error:', e);
      showToast('Error de conexi\u00f3n al eliminar');
    }
  }, [showToast]);

  const updateOrder = useCallback((orderId: number, updates: Partial<Order>) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
  }, []);

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
    else if (statusFilter === 'pending') result = result.filter(o => !o.confirmed && getOrderStatus(o) !== 'rechazado');
    else if (statusFilter === 'rejected') result = result.filter(o => getOrderStatus(o) === 'rechazado');
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

  // Monthly summary — only confirmed orders (confirmado/realizado)
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

  const { totalOrders, confirmedOrders, rejectedOrders, confirmedRevenue } = useMemo(() => ({
    totalOrders: orders.length,
    confirmedOrders: orders.filter(o => o.confirmed).length,
    rejectedOrders: orders.filter(o => getOrderStatus(o) === 'rechazado').length,
    confirmedRevenue: orders.filter(o => o.confirmed).reduce((s, o) => s + o.total, 0),
  }), [orders]);

  return (
    <div>
      {/* Compact dashboard — hidden for vendedora */}
      {_adminRole === 'admin' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-heading font-bold text-xl text-purple">{totalOrders}</span>
              <span className="text-gray-400 text-xs font-body ml-1">pedidos</span>
              <span className="mx-2 text-gray-200">|</span>
              <span className="font-heading font-bold text-xl text-teal">{confirmedOrders}</span>
              <span className="text-gray-400 text-xs font-body ml-1">confirmados</span>
            </div>
            <div className="text-right">
              <p className="font-heading font-bold text-lg text-purple">{formatCurrency(confirmedRevenue)}</p>
              <p className="text-[10px] font-body text-gray-400">ingresos confirmados</p>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Summary — compact collapsible, hidden for vendedora */}
      {_adminRole === 'admin' && monthlySummary.length > 0 && (
        <details className="bg-white rounded-2xl border border-gray-100 mb-5 group">
          <summary className="flex items-center justify-between p-4 cursor-pointer select-none">
            <span className="font-heading font-bold text-sm text-purple">Resumen mensual</span>
            <span className="font-heading font-bold text-sm text-purple">{formatCurrency(confirmedRevenue)}</span>
          </summary>
          <div className="px-4 pb-4 space-y-1.5">
            {monthlySummary.map((m) => (
              <div key={m.label} className="flex items-center justify-between py-1.5 text-sm">
                <span className="font-heading text-gray-700">{m.label} <span className="text-gray-400 text-xs">({m.count})</span></span>
                <span className="font-heading font-bold text-purple">{formatCurrency(m.total)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {([['all', `Todos (${totalOrders})`], ['pending', `Pendientes (${totalOrders - confirmedOrders - rejectedOrders})`], ['confirmed', `Confirmados (${confirmedOrders})`], ['rejected', `Rechazados (${rejectedOrders})`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setStatusFilter(key)} className={`px-3 py-1 rounded-full font-heading font-semibold text-xs transition-all ${statusFilter === key ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {label}
          </button>
        ))}
        <span className="mx-1 text-gray-200">|</span>
        <button onClick={() => setSortMode(sortMode === 'created' ? 'event' : 'created')} className="px-3 py-1 rounded-full font-heading font-semibold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all">
          {sortMode === 'created' ? 'Por evento' : 'Por fecha'}
        </button>
        <button onClick={() => { exportCSV(); showToast('CSV descargado'); }} className="px-3 py-1 rounded-full font-heading font-semibold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all">CSV</button>
        <button onClick={fetchOrders} disabled={loading} className="px-3 py-1 rounded-full font-heading font-semibold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-all ml-auto">
          {loading ? '...' : '\u21BB'}
        </button>
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

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="skeleton w-16 h-5" />
                  <div>
                    <div className="skeleton w-24 h-4 mb-1.5" />
                    <div className="skeleton w-40 h-3" />
                  </div>
                </div>
                <div className="skeleton w-20 h-5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredOrders.length === 0 && !error && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">{'\uD83D\uDCCB'}</div>
          <p className="font-heading font-bold text-lg text-gray-400 mb-1">{search ? 'No se encontraron pedidos' : 'No hay pedidos'}</p>
          <p className="font-body text-sm text-gray-400">{search ? 'Prueba con otro nombre o fecha' : 'Los pedidos aparecer\u00e1n aqu\u00ed'}</p>
        </div>
      )}

      {!loading && groupedByEvent ? (
        groupedByEvent.map(group => (
          <div key={group.date} className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-heading font-bold text-sm text-purple">{group.label}</h3>
              <span className="text-xs font-body text-gray-400">{group.orders.length} pedido{group.orders.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-3">{group.orders.map(o => (
              <OrderCard
                key={o.id}
                order={o}
                isExpanded={expandedOrder === o.id}
                onToggleExpand={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}
                patchOrder={patchOrder}
                fetchOrders={fetchOrders}
                onDeleteOrder={deleteOrder}
                onSetStatus={setOrderStatus}
                onUpdateOrder={updateOrder}
                allProducts={allProducts}
              />
            ))}</div>
          </div>
        ))
      ) : !loading ? (
        <div className="space-y-3">{filteredOrders.map(o => (
          <OrderCard
            key={o.id}
            order={o}
            isExpanded={expandedOrder === o.id}
            onToggleExpand={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}
            patchOrder={patchOrder}
            fetchOrders={fetchOrders}
            onDeleteOrder={deleteOrder}
            onSetStatus={setOrderStatus}
            onUpdateOrder={updateOrder}
            allProducts={allProducts}
          />
        ))}</div>
      ) : null}
    </div>
  );
}

// ─── PRODUCTS TAB ───
const ALL_CATEGORIES = ['planes', 'spa', 'show', 'snacks', 'softplay', 'bounces', 'ballpit', 'addons', 'creative'];
const INPUT_CLS = 'w-full border-2 border-gray-200 rounded-xl py-2 px-3 font-body text-sm focus:border-purple focus:outline-none';

function ProductsTab() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<DBProduct[]>([]);
  const [variants, setVariants] = useState<DBProductVariant[]>([]);
  const [filter, setFilter] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', desc: '', price: '', cat: '', variant_label: '', featured: false, max_quantity: '' });
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

  // ─── LOAD from pt_products + pt_product_variants ───
  useEffect(() => {
    async function load() {
      try {
        const [dbProducts, dbVariants, customCats] = await Promise.all([
          fetchDBProducts(),
          fetchDBProductVariants(),
          fetchSetting<Array<{ id: string; label: string; icon: string; description: string }>>('custom_categories'),
        ]);
        setProducts(dbProducts);
        setVariants(dbVariants);
        if (customCats && customCats.length > 0) {
          setAllCategories([...ALL_CATEGORIES, ...customCats.map(c => c.id)]);
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
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken }, body: formData });
      if (res.ok) {
        const data = await res.json();
        const newUrl = data.path + '?t=' + Date.now();
        if (imageIndex === 0) {
          setProducts(prev => prev.map(p => p.id === productId ? { ...p, image_url: newUrl } : p));
          setImageKeys(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
          apiUpsertProduct({ id: productId, image_url: newUrl }).then(() => revalidateSite()).catch(e => console.error('Save image error:', e));
        }
        const currentGallery = [...(imageGalleries[productId] || [])];
        while (currentGallery.length <= imageIndex) currentGallery.push('');
        currentGallery[imageIndex] = newUrl;
        if (imageIndex === 0) {
          const product = products.find(p => p.id === productId);
          currentGallery[0] = product?.image_url || newUrl;
        }
        setImageGalleries(prev => ({ ...prev, [productId]: currentGallery }));
        upsertProductImages(productId, currentGallery).catch(e => console.error('Save gallery error:', e));
        showToast('Foto actualizada');
      } else { showToast('Error al subir foto'); }
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
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-pin': _adminPin, 'x-admin-token': _adminToken }, body: formData });
      if (res.ok) {
        const data = await res.json();
        const newUrl = data.path + '?t=' + Date.now();
        const variant = variants.find(v => v.product_id === productId && v.id === variantId);
        if (variant) {
          const updated = { ...variant, image_url: newUrl };
          setVariants(prev => prev.map(v => (v.product_id === productId && v.id === variantId) ? updated : v));
          apiUpsertVariant(updated).then(() => revalidateSite()).catch(e => console.error('Save variant image error:', e));
        }
        showToast('Foto de variante actualizada');
      } else { showToast('Error al subir foto'); }
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
    setEditForm({ name: p.name, desc: p.description, price: String(p.price), cat: p.category, variant_label: p.variant_label || '', featured: p.featured, max_quantity: p.max_quantity ? String(p.max_quantity) : '' });
  };

  // ─── SAVE EDIT ───
  const saveEdit = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const parsedPrice = parseFloat(editForm.price);
    const parsedMax = editForm.max_quantity ? parseInt(editForm.max_quantity) : null;
    const updated: DBProduct = {
      ...product,
      name: editForm.name || product.name,
      description: editForm.desc,
      price: isNaN(parsedPrice) ? product.price : parsedPrice,
      category: editForm.cat || product.category,
      variant_label: editForm.variant_label || null,
      featured: editForm.featured,
      max_quantity: parsedMax,
    };
    setProducts(prev => prev.map(p => p.id === id ? updated : p));
    setEditingId(null);
    const ok = await apiUpsertProduct({ id, name: updated.name, description: updated.description, price: updated.price, category: updated.category, variant_label: updated.variant_label, featured: updated.featured, max_quantity: updated.max_quantity });
    if (ok) revalidateSite();
    showToast(ok ? 'Producto guardado' : 'Error al guardar');
  };

  // ─── ADD PRODUCT ───
  const handleAddProduct = async () => {
    if (!newProduct.name.trim()) return;
    const id = `prod-${Date.now()}`;
    const product: DBProduct = { id, name: newProduct.name, category: newProduct.cat, price: Number(newProduct.price) || 0, description: newProduct.desc, image_url: null, active: true, featured: false, max_quantity: null, variant_label: null, sort_order: products.length };
    setProducts(prev => [...prev, product]);
    const ok = await apiUpsertProduct(product);
    if (ok) revalidateSite();
    else showToast('Error al guardar');
    setNewProduct({ name: '', cat: 'planes', price: '', desc: '' });
    setShowAdd(false);
    showToast('Producto agregado');
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
    const newProd: DBProduct = { id: newId, name: variant.label, category: parent.category, price: variant.price ?? parent.price, description: '', image_url: variant.image_url, active: true, featured: false, max_quantity: null, variant_label: null, sort_order: products.length };
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-xl text-purple mb-0.5">Productos</h2>
          <p className="font-body text-gray-500 text-xs">{products.length} productos en la base de datos</p>
        </div>
        <div className="flex gap-2">
          {!combineMode && (
            <>
              <button onClick={() => { setCombineMode(true); setCombineSelected(new Set()); }} className="font-heading font-bold px-3 py-2 rounded-xl text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Combinar</button>
              <button onClick={() => { setReorderMode(!reorderMode); if (reorderMode) showToast('Orden guardado'); }} className={`font-heading font-bold px-3 py-2 rounded-xl text-xs transition-colors ${reorderMode ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {reorderMode ? '\u2713 Listo' : '\u21C5 Ordenar'}
              </button>
              <button onClick={() => setShowAdd(!showAdd)} className="bg-purple text-white font-heading font-bold w-9 h-9 rounded-xl text-lg hover:bg-purple-light transition-colors flex items-center justify-center">
                {showAdd ? '\u00D7' : '+'}
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

      {/* Category filter */}
      <div className={`flex gap-2 flex-wrap ${reorderMode ? 'opacity-50 pointer-events-none' : ''}`}>
        {allCategories.map(c => (
          <button key={c} onClick={() => setFilter(filter === c ? '' : c)} className={`px-3 py-1 rounded-full text-xs font-heading font-semibold ${filter === c ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{getCatLabel(c)}</button>
        ))}
      </div>

      {/* Product list */}
      {!filter && !productSearch ? (
        <div className="text-center py-6">
          <p className="font-body text-sm text-gray-400">Selecciona una categoria o busca un producto</p>
        </div>
      ) : (
      <div className="space-y-2">
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
              className={`bg-white rounded-xl border p-3 transition-all ${!product.active ? 'opacity-40 border-gray-200' : 'border-gray-100'} ${draggingId === product.id ? 'opacity-40 scale-95' : ''} ${dragOverId === product.id && draggingId !== product.id ? 'border-t-2 border-t-purple' : ''} ${isCombineSelected ? 'ring-2 ring-purple' : ''}`}
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
                  <button onClick={(e) => { e.stopPropagation(); toggleActive(product.id); }} className={`w-10 h-6 rounded-full flex-shrink-0 transition-colors relative ${!product.active ? 'bg-gray-300' : 'bg-teal'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${!product.active ? 'left-1' : 'left-5'}`} />
                  </button>
                )}

                {/* Thumbnail */}
                <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {imgSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${product.id}-${imageKeys[product.id] || 0}`} src={imgSrc} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs font-bold">IMG</div>
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
                  </div>
                </div>
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
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={editForm.max_quantity} onChange={(e) => setEditForm({ ...editForm, max_quantity: e.target.value })} placeholder="Cant. maxima (opc)" className={INPUT_CLS} />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editForm.featured} onChange={(e) => setEditForm({ ...editForm, featured: e.target.checked })} className="w-4 h-4 accent-purple rounded" />
                      <span className="font-body text-sm text-gray-600">Destacado</span>
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
                        <span className="font-heading text-xs text-gray-700 flex-1 truncate">{v.label}</span>
                        {v.price !== null && <span className="font-body text-xs text-gray-400">${v.price}</span>}
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
    upsertSetting('category_order', newCats.map(c => c.id)).catch(e => console.error('Save cat order:', e));
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
            <div
              key={cat.id}
              draggable
              onDragStart={() => setCatDragging(cat.id)}
              onDragOver={(e) => { e.preventDefault(); setCatDragOver(cat.id); }}
              onDragEnd={() => { setCatDragging(null); setCatDragOver(null); }}
              onDrop={() => handleCatDrop(cat.id)}
              className={`bg-white rounded-xl border border-gray-100 overflow-hidden transition-all ${catDragging === cat.id ? 'opacity-40 scale-95' : ''} ${catDragOver === cat.id && catDragging !== cat.id ? 'border-t-2 border-t-purple' : ''}`}
            >
              <div className="flex items-center">
                <div className="px-2 cursor-grab active:cursor-grabbing text-gray-300 hover:text-purple select-none text-lg">{'\u2807'}</div>
                <button onClick={() => { setExpandedCatId(isExpanded ? null : cat.id); if (isEditing) setEditingCatId(null); }} className="flex-1 text-left p-4 pl-0 hover:bg-gray-50 transition-colors">
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
              </div>
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 bg-gray-50/50">
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
                            await upsertSetting('custom_categories', existing.filter(c => c.id !== cat.id));
                            const order = categories.filter(c => c.id !== cat.id).map(c => c.id);
                            await upsertSetting('category_order', order);
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
    headers: { 'x-admin-token': _adminToken, 'x-admin-pin': _adminPin },
  }).catch(() => {});
}

function WebsiteTab() {
  const { showToast } = useToast();
  const [section, setSection] = useState<'homepage' | 'featured' | 'areas' | 'logo'>('homepage');
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([]);

  useEffect(() => { fetchDBProducts().then(setDbProducts).catch(() => {}); }, []);

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
    { key: 'homepage', label: 'Textos' },
    { key: 'logo', label: 'Logo & Media' },
    { key: 'featured', label: 'Destacados' },
    { key: 'areas', label: 'Config' },
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

          {/* Reels merged here */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <p className="font-heading font-bold text-sm text-purple mb-3">Instagram Reels</p>
            <p className="font-body text-gray-500 text-xs mb-3">Links de los 3 reels para la p{'á'}gina principal</p>
            {reelUrls.map((url, i) => (
              <div key={i} className="mb-2">
                <input type="url" value={url} onChange={e => { const u = [...reelUrls]; u[i] = e.target.value; setReelUrls(u); }} placeholder={`Reel ${i + 1} — https://instagram.com/reel/...`} className={WI_CLS} />
              </div>
            ))}
            <button onClick={saveReels} disabled={savingSection === 'reels'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'reels' ? 'Guardando...' : 'Guardar Reels'}</button>
          </div>
        </div>
      )}

      {/* B) Featured Products */}
      {section === 'featured' && featLoaded && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-body text-gray-500 text-sm">Selecciona hasta 6 productos para &ldquo;Los M&aacute;s Populares&rdquo;</p>
            <span className={`font-heading font-bold text-sm ${featuredIds.length >= 6 ? 'text-orange' : 'text-purple'}`}>{featuredIds.length}/6</span>
          </div>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
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
          <button onClick={saveFeatured} disabled={savingSection === 'featured'} className="bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-xl hover:bg-purple-light transition-colors text-sm disabled:opacity-50">{savingSection === 'featured' ? 'Guardando...' : 'Guardar Destacados'}</button>
        </div>
      )}

      {/* C) Areas */}
      {section === 'areas' && areasLoaded && (
        <div className="space-y-4">
          <p className="font-body text-gray-500 text-sm">&Aacute;reas de cobertura con precio de transporte</p>
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
// ArrayBuffer conversion helper for WebAuthn
const toBuffer = (u: Uint8Array): ArrayBuffer => { const ab = new ArrayBuffer(u.byteLength); new Uint8Array(ab).set(u); return ab; };

function base64urlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export default function AdminPage() {
  const { showToast } = useToast();
  const [pin, setPin] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'pedidos' | 'website' | 'catalogo'>('pedidos');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [webauthnAvailable, setWebauthnAvailable] = useState(false);
  const [showWebauthnSetup, setShowWebauthnSetup] = useState(false);
  const [webauthnLoading, setWebauthnLoading] = useState(false);
  const autoTriggered = useRef(false);

  // Check if WebAuthn/Face ID is available on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pt_webauthn_available');
      if (saved === 'true') setWebauthnAvailable(true);
    }
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

  // WebAuthn: Authenticate with Face ID / passkey
  const handleWebauthnLogin = async () => {
    setWebauthnLoading(true);
    setError('');
    try {
      // 1. Get authentication options from server
      const optRes = await fetch('/api/auth/webauthn/authenticate');
      const optData = await optRes.json();
      if (!optData.ok) {
        // No passkeys registered, fall back
        setWebauthnAvailable(false);
        localStorage.removeItem('pt_webauthn_available');
        setError(optData.error || 'No hay passkeys registradas');
        setWebauthnLoading(false);
        return;
      }

      const options = optData.options;

      // 2. Call navigator.credentials.get with options
      const publicKeyOptions: PublicKeyCredentialRequestOptions = {
        challenge: toBuffer(base64urlToUint8Array(options.challenge)),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: options.userVerification as UserVerificationRequirement,
        allowCredentials: options.allowCredentials.map((c: { type: string; id: string }) => ({
          type: c.type,
          id: toBuffer(base64urlToUint8Array(c.id)),
        })),
      };

      const assertion = await navigator.credentials.get({ publicKey: publicKeyOptions }) as PublicKeyCredential;
      if (!assertion) { setWebauthnLoading(false); return; }

      const assertionResponse = assertion.response as AuthenticatorAssertionResponse;

      // 3. Send to server for verification
      const verifyRes = await fetch('/api/auth/webauthn/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: {
            id: assertion.id,
            rawId: uint8ArrayToBase64url(new Uint8Array(assertion.rawId)),
            type: assertion.type,
            response: {
              clientDataJSON: uint8ArrayToBase64url(new Uint8Array(assertionResponse.clientDataJSON)),
              authenticatorData: uint8ArrayToBase64url(new Uint8Array(assertionResponse.authenticatorData)),
              signature: uint8ArrayToBase64url(new Uint8Array(assertionResponse.signature)),
            },
          },
          challenge: options.challenge,
        }),
      });

      const verifyData = await verifyRes.json();
      if (verifyData.ok) {
        _adminToken = verifyData.token || '';
        _adminRole = verifyData.role || 'admin';
        setAuthenticated(true);
      } else {
        setError(verifyData.error || 'Error de autenticación');
      }
    } catch (err) {
      console.error('WebAuthn login error:', err);
      setError('Error al usar Face ID');
    }
    setWebauthnLoading(false);
  };

  // Auto-trigger Face ID on page load
  useEffect(() => {
    if (webauthnAvailable && !authenticated && !autoTriggered.current) {
      autoTriggered.current = true;
      const timer = setTimeout(() => {
        handleWebauthnLogin();
      }, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webauthnAvailable, authenticated]);

  // WebAuthn: Register new passkey after PIN login
  const handleWebauthnSetup = async () => {
    setWebauthnLoading(true);
    try {
      // 1. Get registration options
      const optRes = await fetch('/api/auth/webauthn/register', {
        headers: { 'x-admin-token': _adminToken },
      });
      const optData = await optRes.json();
      if (!optData.ok) {
        console.error('WebAuthn setup error:', optData.error);
        setShowWebauthnSetup(false);
        setWebauthnLoading(false);
        return;
      }

      const options = optData.options;

      // 2. Call navigator.credentials.create
      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        challenge: toBuffer(base64urlToUint8Array(options.challenge)),
        rp: options.rp,
        user: {
          id: toBuffer(base64urlToUint8Array(options.user.id)),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        authenticatorSelection: {
          authenticatorAttachment: options.authenticatorSelection.authenticatorAttachment as AuthenticatorAttachment,
          residentKey: options.authenticatorSelection.residentKey as ResidentKeyRequirement,
          userVerification: options.authenticatorSelection.userVerification as UserVerificationRequirement,
        },
        attestation: options.attestation as AttestationConveyancePreference,
        timeout: options.timeout,
        excludeCredentials: (options.excludeCredentials || []).map((c: { type: string; id: string }) => ({
          type: c.type,
          id: toBuffer(base64urlToUint8Array(c.id)),
        })),
      };

      const attestation = await navigator.credentials.create({ publicKey: publicKeyOptions }) as PublicKeyCredential;
      if (!attestation) { setWebauthnLoading(false); return; }

      const attestationResponse = attestation.response as AuthenticatorAttestationResponse;

      // 3. Send to server
      const verifyRes = await fetch('/api/auth/webauthn/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': _adminToken,
        },
        body: JSON.stringify({
          credential: {
            id: attestation.id,
            rawId: uint8ArrayToBase64url(new Uint8Array(attestation.rawId)),
            type: attestation.type,
            response: {
              clientDataJSON: uint8ArrayToBase64url(new Uint8Array(attestationResponse.clientDataJSON)),
              attestationObject: uint8ArrayToBase64url(new Uint8Array(attestationResponse.attestationObject)),
            },
          },
          challenge: options.challenge,
          deviceName: navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('iPad') ? 'iPad' : 'Dispositivo',
        }),
      });

      const verifyData = await verifyRes.json();
      if (verifyData.ok) {
        localStorage.setItem('pt_webauthn_available', 'true');
        setWebauthnAvailable(true);
      }
    } catch (err) {
      console.error('WebAuthn setup error:', err);
    }
    setShowWebauthnSetup(false);
    setWebauthnLoading(false);
  };

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
        _adminRole = data.role || 'admin';
        setAuthenticated(true);

        // After successful PIN login, check if platform authenticator is available
        if (typeof window !== 'undefined' && window.PublicKeyCredential) {
          try {
            const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            if (available && !localStorage.getItem('pt_webauthn_available')) {
              setShowWebauthnSetup(true);
            }
          } catch { /* ignore */ }
        }
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

          {/* Face ID / WebAuthn login button */}
          {webauthnAvailable && (
            <button
              type="button"
              onClick={handleWebauthnLogin}
              disabled={webauthnLoading}
              className="w-full bg-purple text-white font-heading font-bold py-3 rounded-xl hover:bg-purple-light transition-colors mb-3 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {webauthnLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Entrar con Face ID
                </>
              )}
            </button>
          )}

          {webauthnAvailable && (
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-body">o con PIN</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          )}

          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(''); }}
            placeholder="PIN de 4 dígitos"
            className="w-full text-center text-2xl tracking-[0.5em] font-heading font-bold border-2 border-gray-200 rounded-xl py-3 px-4 focus:border-purple focus:outline-none mb-4"
            autoFocus={!webauthnAvailable}
          />
          {error && <p className="text-red-500 text-sm text-center mb-3 font-body">{error}</p>}
          <button type="submit" className="w-full bg-purple text-white font-heading font-bold py-3 rounded-xl hover:bg-purple-light transition-colors">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  // WebAuthn setup prompt after PIN login
  if (showWebauthnSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream px-4">
        <div className="bg-white rounded-3xl p-8 shadow-lg max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-purple/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="font-heading font-bold text-xl text-purple mb-2">Acceso rapido</h2>
          <p className="font-body text-gray-500 text-sm mb-6">Configura Face ID para entrar sin PIN la proxima vez</p>
          <button
            onClick={handleWebauthnSetup}
            disabled={webauthnLoading}
            className="w-full bg-purple text-white font-heading font-bold py-3 rounded-xl hover:bg-purple-light transition-colors mb-3 disabled:opacity-50 flex items-center justify-center"
          >
            {webauthnLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Configurar Face ID'
            )}
          </button>
          <button
            onClick={() => setShowWebauthnSetup(false)}
            className="w-full text-gray-400 font-body text-sm py-2 hover:text-gray-600 transition-colors"
          >
            No, gracias
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Minimal header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-heading font-bold text-2xl text-purple">PlayTime</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={togglePush}
            className="text-gray-400 hover:text-purple transition-colors text-lg"
            title={pushEnabled ? 'Notificaciones activadas' : 'Activar notificaciones'}
          >
            {pushEnabled ? '\u{1F514}' : '\u{1F515}'}
          </button>
          <span className="text-xs font-body text-gray-400">{_adminRole === 'vendedora' ? 'Vendedora' : 'Admin'}</span>
        </div>
      </div>

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

      {tab === 'pedidos' && <OrdersTab />}
      {_adminRole === 'admin' && tab === 'catalogo' && <CatalogoAdminTab />}
      {_adminRole === 'admin' && tab === 'website' && <WebsiteTab />}
    </div>
  );
}
