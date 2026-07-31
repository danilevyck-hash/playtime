'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { EVENT_AREAS, type PaymentMethod } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { downloadOrderPDF } from '@/lib/pdf-order';
import { fetchLogoUrl, fetchProductOverrides, fetchAllCustomProducts, fetchEventAreas } from '@/lib/supabase-data';
import { PRODUCTS } from '@/lib/constants';
import { computeOrderTotals } from '@/lib/order-math';
import { canonicalStatus, type OrderStatus } from '@/lib/order-status';
import { panamaToday } from '@/lib/timezone';
import { useToast } from '@/context/ToastContext';
import { RETURN_TO_LIST_KEY, RETURN_FROM_DETAIL_KEY } from '@/app/admin/components/shared';

const ORDER_STATUSES: { key: OrderStatus; label: string }[] = [
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'confirmado', label: 'Confirmado' },
  { key: 'realizado', label: 'Realizado' },
  { key: 'rechazado', label: 'Rechazado' },
];

// Transiciones permitidas (validadas también en el server).
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente: ['confirmado', 'rechazado'],
  confirmado: ['realizado', 'rechazado', 'pendiente'], // pendiente = deshacer un confirmado por error
  realizado: ['confirmado'], // deshacer un realizado por error
  rechazado: ['pendiente'], // reactivar
};

const STATUS_HEX: Record<OrderStatus, string> = {
  pendiente: '#888780',
  confirmado: '#580459',
  realizado: '#1D9E75',
  rechazado: '#E24B4A',
};

interface OrderItem {
  id?: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Deposit { id?: string; amount: number; date: string }

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
  deleted_at: string | null;
  deposit_amount: number | null;
  deposits: Deposit[];
  discount: number;
  discount_type: 'fixed' | 'percent';
  transport_cost_confirmed: number | null;
  created_at: string;
  confirmed: boolean;
  items: OrderItem[];
}

function fmtTime12h(t: string): string {
  if (!t) return '';
  const trimmed = t.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!m) return trimmed;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return trimmed;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(min).padStart(2, '0')} ${ap}`;
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PedidoDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = Number(params?.id);
  const { showToast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [token, setToken] = useState('');
  const [savingAction, setSavingAction] = useState<string | null>(null);

  // UI state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ event: true });
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [isEditingItems] = useState(true);
  const [itemEdits, setItemEdits] = useState<Record<number, { quantity: string; unit_price: string }>>({});
  const [newItemForm, setNewItemForm] = useState({ name: '', qty: '1', price: '' });
  const [allProducts, setAllProducts] = useState<{ id: string; name: string; price: number }[]>([]);
  const [productSuggestions, setProductSuggestions] = useState<{ id: string; name: string; price: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [transportInput, setTransportInput] = useState('');
  const [isEditingTransport, setIsEditingTransport] = useState(false);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [depositInput, setDepositInput] = useState('');
  const [depositDate, setDepositDate] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Restore session
  useEffect(() => {
    try {
      const t = sessionStorage.getItem('adminToken') || '';
      if (!t) {
        router.push('/admin');
        return;
      }
      setToken(t);
      setAuthReady(true);
    } catch {
      router.push('/admin');
    }
  }, [router]);

  // "← Pedidos". Volver con history.back() en vez de router.push('/admin'):
  // push crea una entrada NUEVA de historial y el navegador la abre arriba de
  // todo, así que se perdía la posición del listado. back() vuelve a la entrada
  // anterior, que es la que tiene el scroll guardado.
  //
  // La marca la deja el listado al abrir el pedido (OrdersTab.goToOrder). Si no
  // está, se entró directo por URL: ahí atrás no hay listado y un back() sacaría
  // al usuario de la app, así que se navega a /admin como antes.
  const volverAlListado = useCallback(() => {
    let vinoDelListado = false;
    try {
      vinoDelListado = sessionStorage.getItem(RETURN_TO_LIST_KEY) === '1';
      if (vinoDelListado) sessionStorage.removeItem(RETURN_TO_LIST_KEY);
    } catch {}
    if (vinoDelListado) {
      // Confirma la VUELTA para que el listado reponga el scroll. Va aparte de
      // la marca de arriba porque esa ya se consumió, y porque el listado tiene
      // que poder distinguir "volví de un pedido" de "acabo de escribir el PIN"
      // — los dos lo montan por primera vez y solo el primero debe reponer.
      try { sessionStorage.setItem(RETURN_FROM_DETAIL_KEY, '1'); } catch {}
      router.back();
    } else {
      router.push('/admin');
    }
  }, [router]);

  const authHeaders = useCallback((extra?: Record<string, string>) => ({
    'Content-Type': 'application/json',
    'x-admin-token': token,
    ...extra,
  }), [token]);

  const loadOrder = useCallback(async () => {
    if (!authReady || !orderId || Number.isNaN(orderId)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { headers: authHeaders() });
      if (res.status === 404) { setNotFound(true); return; }
      if (res.status === 401) { router.push('/admin'); return; }
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setOrder(data.order);
      setNoteInput(data.order?.internal_note || '');
    } catch (e) {
      console.error(e);
      showToast('Error al cargar pedido');
    } finally {
      setLoading(false);
    }
  }, [authReady, orderId, authHeaders, router, showToast]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

  // Sync itemEdits with current order items (so "no pending changes" is the default state)
  useEffect(() => {
    if (!order) return;
    const sync: Record<number, { quantity: string; unit_price: string }> = {};
    for (const i of order.items) {
      if (i.id) sync[i.id] = { quantity: String(i.quantity), unit_price: String(i.unit_price) };
    }
    setItemEdits(sync);
  }, [order]);

  // Load all products for autocomplete
  useEffect(() => {
    let cancelled = false;
    async function loadAllProducts() {
      try {
        const [overrides, custom] = await Promise.all([fetchProductOverrides(), fetchAllCustomProducts()]);
        if (cancelled) return;
        const ovMap = new Map(overrides.map(o => [o.id, o]));
        const merged = PRODUCTS.map(p => {
          const ov = ovMap.get(p.id);
          return { id: p.id, name: ov?.name_override || p.name, price: ov?.price_override ?? p.price };
        });
        const customMapped = custom.map(cp => ({ id: cp.id, name: cp.name, price: cp.price }));
        setAllProducts([...merged, ...customMapped]);
      } catch {
        if (!cancelled) setAllProducts(PRODUCTS.map(p => ({ id: p.id, name: p.name, price: p.price })));
      }
    }
    loadAllProducts();
    return () => { cancelled = true; };
  }, []);

  const patchOrder = useCallback(async (body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> => {
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ orderId, ...body }),
      });
      if (res.ok) return { ok: true, data: await res.json().catch(() => ({})) };
      if (res.status === 401) {
        router.push('/admin');
        return { ok: false, error: 'Sesión expirada' };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `Error ${res.status}` };
    } catch (e) {
      console.error('patchOrder network error:', e);
      return { ok: false, error: 'Error de conexión' };
    }
  }, [authHeaders, orderId, router]);

  // Computed
  const liveItemsTotal = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((s, i) => {
      if (isEditingItems && i.id && itemEdits[i.id]) {
        return s + (Number(itemEdits[i.id].unit_price) || 0) * (Number(itemEdits[i.id].quantity) || 1);
      }
      return s + i.unit_price * i.quantity;
    }, 0);
  }, [order, isEditingItems, itemEdits]);

  const hasPendingItemEdits = useMemo(() => {
    if (!order) return false;
    for (const i of order.items) {
      if (!i.id) continue;
      const edit = itemEdits[i.id];
      if (!edit) continue;
      if (Number(edit.quantity) !== i.quantity) return true;
      if (Number(edit.unit_price) !== i.unit_price) return true;
    }
    return false;
  }, [order, itemEdits]);

  const liveTrans = order?.transport_cost_confirmed ?? 0;
  const liveTotals = computeOrderTotals({
    itemsTotal: liveItemsTotal,
    transport: liveTrans,
    discount: order?.discount || 0,
    discountType: order?.discount_type === 'percent' ? 'percent' : 'fixed',
    paymentMethod: (order?.payment_method as PaymentMethod) || 'bank_transfer',
  });
  const liveDisc = liveTotals.discountAmount;
  const liveSurch = liveTotals.surcharge;
  const liveTotal = liveTotals.total;
  const totalDeposits = (order?.deposits || []).reduce((s, d) => s + d.amount, 0) || (order?.deposit_amount ?? 0);
  const balance = Math.max(0, liveTotal - totalDeposits);
  const status: OrderStatus = order ? canonicalStatus(order) : 'pendiente';
  const payMethodLabel = order?.payment_method === 'credit_card' ? 'Tarjeta (+5%)' : 'Transferencia';

  if (!authReady) return null;

  if (notFound) {
    return (
      <div className="min-h-screen bg-white px-4 py-8 max-w-2xl mx-auto">
        <button onClick={volverAlListado} className="text-sm text-purple font-heading font-semibold mb-6">{'←'} Pedidos</button>
        <div className="text-center py-16">
          <p className="font-heading font-bold text-lg text-gray-400">Pedido no encontrado</p>
        </div>
      </div>
    );
  }

  if (loading || !order) {
    return (
      <div className="min-h-screen bg-white px-4 py-8 max-w-2xl mx-auto">
        <button onClick={volverAlListado} className="text-sm text-purple font-heading font-semibold mb-6">{'←'} Pedidos</button>
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-purple border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // ── Handlers ──
  const setStatus = async (s: OrderStatus) => {
    if (s === status) return;
    if (!STATUS_TRANSITIONS[status].includes(s)) { showToast('Transición no permitida'); return; }
    if (s === 'rechazado' && !window.confirm(`¿Rechazar el pedido #${order.order_number}?`)) return;
    if (status === 'rechazado' && s === 'pendiente' && !window.confirm('¿Reactivar este pedido (volver a Pendiente)?')) return;
    setSavingAction('status');
    try {
      const result = await patchOrder({ status: s });
      if (result.ok) {
        setOrder(o => o ? { ...o, status: s, confirmed: s === 'confirmado' || s === 'realizado' } : o);
        const label = ORDER_STATUSES.find(x => x.key === s)?.label || s;
        showToast(`Estado: ${label}`);
      } else { showToast('❌ ' + result.error); }
    } finally { setSavingAction(null); }
  };

  const handleRestore = async () => {
    const result = await patchOrder({ restore: true });
    if (result.ok) {
      setOrder(o => o ? { ...o, deleted_at: null } : o);
      showToast('Pedido restaurado');
    } else { showToast('❌ ' + result.error); }
  };

  const startEdit = () => {
    setIsEditing(true);
    setEditForm({
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email || '',
      event_date: order.event_date,
      event_time: order.event_time,
      event_area: order.event_area || '',
      event_address: order.event_address,
      birthday_child_name: order.birthday_child_name || '',
      birthday_child_age: order.birthday_child_age ? String(order.birthday_child_age) : '',
      notes: order.notes || '',
    });
  };

  const saveEdit = async () => {
    const f = editForm;
    if (!f.customer_name?.trim()) { showToast('Nombre requerido'); return; }
    setSavingAction('edit');
    try {
      const editFields = {
        customer_name: f.customer_name,
        customer_phone: f.customer_phone,
        customer_email: f.customer_email,
        event_date: f.event_date,
        event_time: f.event_time,
        event_area: f.event_area,
        event_address: f.event_address,
        birthday_child_name: f.birthday_child_name,
        birthday_child_age: f.birthday_child_age ? Number(f.birthday_child_age) : null,
        notes: f.notes,
      };
      const result = await patchOrder({ editFields });
      if (result.ok) {
        setIsEditing(false);
        showToast('Pedido actualizado');
        loadOrder();
      } else { showToast('❌ ' + result.error); }
    } finally { setSavingAction(null); }
  };

  const saveItemEdits = async () => {
    const editItems = Object.entries(itemEdits).map(([id, v]) => ({
      id: Number(id),
      quantity: Number(v.quantity) || 1,
      unit_price: Number(v.unit_price) || 0,
    }));
    setSavingAction('items');
    try {
      const result = await patchOrder({ editItems });
      if (result.ok) {
        showToast('Items actualizados');
        loadOrder();
      } else { showToast('❌ ' + result.error); }
    } finally { setSavingAction(null); }
  };

  const handleAddItem = async () => {
    const name = newItemForm.name.trim();
    const qty = Number(newItemForm.qty) || 1;
    const price = Number(newItemForm.price);
    if (!name || Number.isNaN(price)) return;
    setSavingAction('additem');
    try {
      // Persist pending item edits FIRST. Adding an item triggers loadOrder(), which
      // would otherwise overwrite quantities/prices the user typed but hasn't saved.
      if (hasPendingItemEdits) {
        const editItems = Object.entries(itemEdits).map(([id, v]) => ({
          id: Number(id),
          quantity: Number(v.quantity) || 1,
          unit_price: Number(v.unit_price) || 0,
        }));
        const editRes = await patchOrder({ editItems });
        if (!editRes.ok) { showToast('❌ ' + editRes.error); return; }
      }
      const result = await patchOrder({ addItem: { product_name: name, quantity: qty, unit_price: price } });
      if (result.ok) {
        // Reset UI inmediatamente, ANTES de re-fetch
        setNewItemForm({ name: '', qty: '1', price: '' });
        setShowSuggestions(false);
        setOpenSections(prev => ({ ...prev, invoice: true }));
        showToast('✅ Item agregado');
        // Reload en background — no bloquea el botón
        loadOrder();
      } else {
        showToast('❌ ' + result.error);
      }
    } finally { setSavingAction(null); }
  };

  const handleRemoveItem = async (itemId: number) => {
    if (!window.confirm('¿Eliminar este item?')) return;
    setSavingAction('removeitem');
    try {
      const result = await patchOrder({ removeItem: itemId });
      if (result.ok) { showToast('Item eliminado'); loadOrder(); }
      else { showToast('❌ ' + result.error); }
    } finally { setSavingAction(null); }
  };

  const saveDiscount = async (val?: number, type?: 'fixed' | 'percent') => {
    const v = val !== undefined ? val : Number(discountInput);
    const t = type || discountType;
    if (Number.isNaN(v) || v < 0) return;
    setSavingAction('discount');
    try {
      const result = await patchOrder({ discount: v, discountType: t });
      if (result.ok) {
        setDiscountInput('');
        showToast('Descuento aplicado');
        loadOrder();
      } else { showToast('❌ ' + result.error); }
    } finally { setSavingAction(null); }
  };

  const saveTransport = async () => {
    const val = Number(transportInput);
    if (Number.isNaN(val) || val < 0) return;
    setSavingAction('transport');
    try {
      const result = await patchOrder({ transportCostConfirmed: val });
      if (result.ok) {
        setTransportInput('');
        setIsEditingTransport(false);
        showToast('Transporte confirmado');
        loadOrder();
      } else { showToast('❌ ' + result.error); }
    } finally { setSavingAction(null); }
  };

  /**
   * Cambia el método de pago del pedido.
   *
   * El 5 % de recargo NO se calcula acá ni se manda desde el cliente: el PATCH
   * dispara `recalc_order_totals` y el total vuelve recalculado por la base.
   * Por eso al terminar se hace `loadOrder()` en vez de tocar el total a mano —
   * es la misma regla que ya seguían descuento y transporte.
   */
  const savePaymentMethod = async (metodo: PaymentMethod) => {
    if (metodo === order?.payment_method) { setIsEditingPayment(false); return; }
    setSavingAction('payment');
    try {
      const result = await patchOrder({ paymentMethod: metodo });
      if (result.ok) {
        setIsEditingPayment(false);
        showToast('Método de pago actualizado');
        loadOrder();
      } else { showToast('❌ ' + result.error); }
    } finally { setSavingAction(null); }
  };

  // Refresca SIEMPRE desde la respuesta real del RPC (deposits + deposit_amount
  // authoritative), nunca desde un array armado en el cliente.
  const applyDepositsFromResponse = (data: Record<string, unknown>) => {
    setOrder(o => o ? {
      ...o,
      deposits: (data.deposits as Deposit[]) ?? o.deposits,
      deposit_amount: (data.deposit_amount as number) ?? o.deposit_amount,
    } : o);
  };

  const addDeposit = async () => {
    const amt = Number(depositInput);
    if (Number.isNaN(amt) || amt <= 0) return;
    const date = depositDate || panamaToday();
    setSavingAction('deposit');
    try {
      const result = await patchOrder({ addDeposit: { amount: amt, date } });
      if (result.ok) {
        applyDepositsFromResponse(result.data);
        setDepositInput('');
        showToast('Depósito agregado');
      } else { showToast('❌ ' + result.error); }
    } finally { setSavingAction(null); }
  };

  const removeDeposit = async (dep: Deposit) => {
    if (!dep.id) { showToast('Recargá la página para eliminar este depósito'); return; }
    if (!window.confirm(`¿Eliminar el depósito de ${formatCurrency(dep.amount || 0)}? Esta acción no se puede deshacer.`)) return;
    const before = (order.deposits || []).length;
    const result = await patchOrder({ removeDeposit: dep.id });
    if (result.ok) {
      applyDepositsFromResponse(result.data);
      const after = ((result.data.deposits as Deposit[]) || []).length;
      showToast(after < before ? 'Depósito eliminado' : 'El depósito ya no existía');
    } else { showToast('❌ ' + result.error); }
  };

  const saveNote = async () => {
    const text = noteInput.trim();
    if (text === (order.internal_note || '')) return;
    const result = await patchOrder({ internalNote: text });
    if (result.ok) {
      setOrder(o => o ? { ...o, internal_note: text } : o);
      showToast('Nota guardada');
    } else { showToast('❌ ' + result.error); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`¿Archivar el pedido #${order.order_number}? Se puede restaurar después.`)) return;
    const res = await fetch('/api/orders', {
      method: 'DELETE',
      headers: authHeaders(),
      body: JSON.stringify({ orderId }),
    });
    if (res.ok) { showToast('Pedido archivado'); router.push('/admin'); }
    else showToast('Error al archivar');
  };

  const handleDownloadPDF = async () => {
    const theme = order.notes?.replace(/^Tema:\s*/, '') || '';
    const logoUrl = await fetchLogoUrl().catch(() => null);
    // Transport: confirmed value if set, else the area price from the LIVE
    // pt_settings list — not the stale EVENT_AREAS constant.
    const areas = await fetchEventAreas().catch(() => EVENT_AREAS);
    const pdfTransport = order.transport_cost_confirmed ?? (order.event_area ? (areas.find(a => a.name === order.event_area)?.price ?? 0) : 0);
    // Same single formula as the DB/RPC — no hardcoded 0.05.
    const pdfTotals = computeOrderTotals({
      itemsTotal: liveItemsTotal,
      transport: pdfTransport,
      discount: order.discount || 0,
      discountType: order.discount_type === 'percent' ? 'percent' : 'fixed',
      paymentMethod: (order.payment_method as PaymentMethod) || 'bank_transfer',
    });
    await downloadOrderPDF({
      orderNumber: order.order_number,
      customer: { name: order.customer_name, phone: order.customer_phone, email: order.customer_email || '' },
      event: { date: order.event_date, time: order.event_time, area: order.event_area || '', address: order.event_address, birthdayChildName: order.birthday_child_name || '', birthdayChildAge: order.birthday_child_age || '', theme },
      items: order.items.map(i => ({ productId: '', name: i.product_name, category: '' as never, quantity: i.quantity, unitPrice: i.unit_price })),
      subtotal: liveItemsTotal,
      discount: pdfTotals.discountAmount,
      discountType: order.discount_type,
      transportCost: pdfTransport,
      surcharge: pdfTotals.surcharge,
      total: pdfTotals.total,
      paymentMethod: order.payment_method as 'bank_transfer' | 'credit_card',
      logoUrl,
      deposits: order.deposits,
    });
    showToast('PDF descargado');
  };

  const handleShare = () => {
    const url = `${window.location.origin}/admin/pedidos/${order.id}`;
    const text = `Pedido #${order.order_number} — ${order.customer_name} — ${formatCurrency(liveTotal)}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: `Pedido #${order.order_number}`, text, url }).catch(() => {});
    } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => showToast('Link copiado')).catch(() => showToast('No se pudo copiar'));
    }
  };

  const toggleSection = (key: string) => setOpenSections(p => ({ ...p, [key]: !p[key] }));

  const OI_CLS = 'w-full border border-gray-200 rounded-lg min-h-[44px] py-2 px-3 font-body text-sm focus:border-purple focus:outline-none';

  return (
    <div className="min-h-screen bg-white">
      {/* ─── HEADER ─── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3">
        {isEditing ? (
          <div className="flex items-center justify-between gap-3 max-w-2xl mx-auto">
            <button onClick={() => setIsEditing(false)} disabled={savingAction === 'edit'} className="text-sm text-gray-500 font-heading font-semibold disabled:opacity-50">Cancelar</button>
            <span className="font-heading font-medium text-sm text-gray-700">Editar</span>
            <button onClick={saveEdit} disabled={savingAction === 'edit'} className="text-sm text-purple font-heading font-semibold disabled:opacity-50">{savingAction === 'edit' ? 'Guardando...' : 'Guardar'}</button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 max-w-2xl mx-auto">
            <button onClick={volverAlListado} className="text-sm text-purple font-heading font-semibold flex items-center gap-1 hover:opacity-70 transition-opacity">
              <span aria-hidden="true">{'←'}</span> Pedidos
            </button>
            <span className="font-heading font-medium text-sm text-gray-800 truncate text-center flex-1 mx-3">
              #{order.order_number} {'·'} {order.customer_name}
            </span>
            <span className="w-12" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-20">
        {/* ─── ARCHIVED BANNER ─── */}
        {order.deleted_at && (
          <div className="flex items-center justify-between gap-3 bg-gray-100 border border-gray-200 rounded-xl px-4 py-3">
            <div>
              <p className="font-heading font-bold text-sm text-gray-700">Pedido archivado</p>
              <p className="font-body text-xs text-gray-400">No aparece en la lista ni en contabilidad.</p>
            </div>
            <button onClick={handleRestore} className="shrink-0 bg-purple text-white font-heading font-bold text-xs px-4 py-2 rounded-lg hover:bg-purple-light transition-colors">
              Restaurar
            </button>
          </div>
        )}

        {/* ─── AVATAR HERO ─── */}
        <div className="flex items-center gap-3 pt-1">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-heading font-semibold text-base flex-shrink-0"
            style={{ backgroundColor: STATUS_HEX[status] }}
            aria-hidden="true"
          >
            {getInitials(order.customer_name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading font-semibold text-base text-gray-800 truncate">{order.customer_name}</p>
            <p className="font-body text-xs text-gray-500">{order.event_date}</p>
          </div>
          <span className="font-heading font-bold text-2xl text-purple">{formatCurrency(liveTotal)}</span>
        </div>

        {/* ─── ESTADO (segmented) ─── */}
        <div>
          <p className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Estado</p>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {ORDER_STATUSES.map(s => {
              const isCurrent = status === s.key;
              const allowed = isCurrent || STATUS_TRANSITIONS[status].includes(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => setStatus(s.key)}
                  disabled={savingAction === 'status' || !allowed}
                  className={`flex-1 py-1.5 min-h-[44px] rounded-lg text-xs font-heading font-semibold transition-all ${isCurrent ? 'bg-white text-purple shadow-sm' : allowed ? 'text-gray-500 hover:text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── ACCIONES ─── */}
        <div className="flex justify-around items-start gap-2 pt-1">
          <button onClick={startEdit} className="flex flex-col items-center gap-1 group" aria-label="Editar">
            <span className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center transition-transform group-active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </span>
            <span className="font-heading text-xs text-gray-600">Editar</span>
          </button>
          <a href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 group" aria-label="WhatsApp">
            <span className="w-11 h-11 rounded-full flex items-center justify-center transition-transform group-active:scale-95" style={{ backgroundColor: '#25D366' }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </span>
            <span className="font-heading text-xs text-gray-600">WhatsApp</span>
          </a>
          <button onClick={handleDownloadPDF} className="flex flex-col items-center gap-1 group" aria-label="PDF">
            <span className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center transition-transform group-active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </span>
            <span className="font-heading text-xs text-gray-600">PDF</span>
          </button>
          <button onClick={handleShare} className="flex flex-col items-center gap-1 group" aria-label="Compartir">
            <span className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center transition-transform group-active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l-4-4-4 4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12" />
              </svg>
            </span>
            <span className="font-heading text-xs text-gray-600">Compartir</span>
          </button>
          <div className="relative">
            <button onClick={() => setShowMoreMenu(!showMoreMenu)} className="flex flex-col items-center gap-1 group" aria-label="Más opciones">
              <span className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center transition-transform group-active:scale-95">
                <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 20 20"><circle cx="4" cy="10" r="2"/><circle cx="10" cy="10" r="2"/><circle cx="16" cy="10" r="2"/></svg>
              </span>
              <span className="font-heading text-xs text-gray-600">Más</span>
            </button>
            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-[160px]">
                <button onClick={() => { setShowMoreMenu(false); handleDelete(); }} className="w-full text-left px-3 py-2 text-sm font-body text-red-500 hover:bg-red-50 transition-colors">Archivar pedido</button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* ─── EVENTO ─── */}
        <div>
          <button onClick={() => toggleSection('event')} className="w-full flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
            <span className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider">Evento</span>
            <span className="text-gray-400 text-xs">{openSections.event ? '▾' : '▸'}</span>
          </button>
          {openSections.event && (
            isEditing ? (
              <div className="space-y-3 pt-3" onFocus={e => { const t = e.target as HTMLElement; if (t.matches('input,select,textarea')) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={editForm.customer_name || ''} onChange={e => setEditForm(p => ({ ...p, customer_name: e.target.value }))} placeholder="Nombre" autoComplete="name" className={OI_CLS} />
                  <input type="tel" inputMode="numeric" autoComplete="tel" value={editForm.customer_phone || ''} onChange={e => setEditForm(p => ({ ...p, customer_phone: e.target.value }))} placeholder="Teléfono" className={OI_CLS} />
                </div>
                <input type="email" inputMode="email" autoComplete="email" value={editForm.customer_email || ''} onChange={e => setEditForm(p => ({ ...p, customer_email: e.target.value }))} placeholder="Email (opcional)" className={OI_CLS} />
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <input type="date" value={editForm.event_date || ''} onChange={e => setEditForm(p => ({ ...p, event_date: e.target.value }))} className={OI_CLS} />
                  <input type="text" value={editForm.event_time || ''} onChange={e => setEditForm(p => ({ ...p, event_time: e.target.value }))} placeholder="Ej: 4:00 pm" className={`${OI_CLS} min-h-[44px] sm:w-32`} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select value={editForm.event_area || ''} onChange={e => setEditForm(p => ({ ...p, event_area: e.target.value }))} className={OI_CLS}>
                    <option value="">Área</option>
                    {EVENT_AREAS.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                  </select>
                  <input value={editForm.event_address || ''} onChange={e => setEditForm(p => ({ ...p, event_address: e.target.value }))} placeholder="Dirección" className={OI_CLS} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input value={editForm.birthday_child_name || ''} onChange={e => setEditForm(p => ({ ...p, birthday_child_name: e.target.value }))} placeholder="Cumpleañero" className={OI_CLS} />
                  <input type="number" inputMode="numeric" value={editForm.birthday_child_age || ''} onChange={e => setEditForm(p => ({ ...p, birthday_child_age: e.target.value }))} placeholder="Edad" className={OI_CLS} />
                  <input value={editForm.notes || ''} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="Tema/Notas" className={OI_CLS} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm pt-3">
                <div><span className="text-gray-400 font-heading text-xs uppercase tracking-wider">Tel</span><br/><a href={`tel:${order.customer_phone}`} className="text-teal font-body">{order.customer_phone}</a></div>
                <div><span className="text-gray-400 font-heading text-xs uppercase tracking-wider">Hora</span><br/><span className="font-body">{fmtTime12h(order.event_time)}</span></div>
                {order.event_area && <div><span className="text-gray-400 font-heading text-xs uppercase tracking-wider">Área</span><br/><span className="font-body">{order.event_area}</span></div>}
                <div><span className="text-gray-400 font-heading text-xs uppercase tracking-wider">Pago</span><br/><span className="font-body">{payMethodLabel}</span></div>
                <div className="col-span-2"><span className="text-gray-400 font-heading text-xs uppercase tracking-wider">Lugar</span><br/><span className="font-body">{order.event_address}</span></div>
                {order.birthday_child_name && <div className="col-span-2"><span className="text-gray-400 font-heading text-xs uppercase tracking-wider">Cumpleañero/a</span><br/><span className="font-body">{order.birthday_child_name}{order.birthday_child_age ? ` (${order.birthday_child_age} años)` : ''}</span></div>}
                {order.notes && <div className="col-span-2"><span className="text-gray-400 font-heading text-xs uppercase tracking-wider">Notas</span><br/><span className="font-body">{order.notes}</span></div>}
              </div>
            )
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* ─── FACTURA ─── */}
        <div>
          <button onClick={() => toggleSection('invoice')} className="w-full flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
            <span className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider">Factura</span>
            <div className="flex items-center gap-2">
              <span className="font-heading font-semibold text-sm text-purple">{formatCurrency(liveTotal)}</span>
              <span className="text-gray-400 text-xs">{openSections.invoice ? '▾' : '▸'}</span>
            </div>
          </button>
          {openSections.invoice && (
            <div className="pt-3 space-y-2">
              <div className="space-y-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm gap-2 py-1.5">
                    {isEditingItems && item.id ? (
                      <>
                        <span className="flex-1 truncate text-gray-700">{item.product_name}</span>
                        <div className="flex items-center gap-2">
                          <input type="number" value={itemEdits[item.id]?.quantity || ''} onChange={e => setItemEdits(prev => ({ ...prev, [item.id!]: { ...prev[item.id!], quantity: e.target.value } }))} className="w-14 min-h-[44px] border border-gray-200 rounded px-2 text-center text-sm" min="1" />
                          <span className="text-gray-500">x</span>
                          <input type="number" value={itemEdits[item.id]?.unit_price || ''} onChange={e => setItemEdits(prev => ({ ...prev, [item.id!]: { ...prev[item.id!], unit_price: e.target.value } }))} className="w-24 min-h-[44px] border border-gray-200 rounded px-2 text-right text-sm" min="0" step="0.01" />
                          <button onClick={() => handleRemoveItem(item.id!)} className="text-gray-400 hover:text-red-500 min-h-[40px] min-w-[40px] flex items-center justify-center"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-700 font-body">{item.product_name} <span className="text-gray-500">x{item.quantity}</span></span>
                        <span className="font-heading font-semibold text-gray-800">{formatCurrency(item.line_total)}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {isEditingItems && (
                <div className="border-t border-gray-100 pt-4 mt-2 space-y-3">
                  <p className="text-xs font-heading font-semibold text-gray-400 uppercase tracking-wider">Agregar item</p>

                  {/* Nombre con autocomplete (full width) */}
                  <div className="relative">
                    <input
                      type="text"
                      value={newItemForm.name}
                      onChange={e => {
                        const q = e.target.value;
                        setNewItemForm(p => ({ ...p, name: q }));
                        if (q.trim().length >= 2) {
                          setProductSuggestions(allProducts.filter(p => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8));
                          setShowSuggestions(true);
                        } else {
                          setShowSuggestions(false);
                        }
                      }}
                      onFocus={() => { if (newItemForm.name.trim().length >= 2) setShowSuggestions(true); }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Buscar producto..."
                      className="w-full min-h-[44px] border border-gray-200 rounded-xl px-4 text-sm font-body focus:border-purple focus:outline-none"
                    />
                    {showSuggestions && productSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                        {productSuggestions.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => {
                              setNewItemForm({ name: p.name, qty: '1', price: String(p.price) });
                              setShowSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-purple/5 text-sm font-body flex items-center justify-between gap-2 min-h-[44px]"
                          >
                            <span className="truncate text-gray-700">{p.name}</span>
                            <span className="text-gray-400 font-heading font-semibold shrink-0">${p.price}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Qty + Precio en una fila */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-heading font-semibold text-gray-400 uppercase tracking-wider mb-1">Cantidad</label>
                      <input
                        type="number"
                        value={newItemForm.qty}
                        onChange={e => setNewItemForm(p => ({ ...p, qty: e.target.value }))}
                        placeholder="1"
                        className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 text-center text-sm font-body focus:border-purple focus:outline-none"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-heading font-semibold text-gray-400 uppercase tracking-wider mb-1">Precio</label>
                      <input
                        type="number"
                        value={newItemForm.price}
                        onChange={e => setNewItemForm(p => ({ ...p, price: e.target.value }))}
                        placeholder="$0.00"
                        className="w-full min-h-[44px] border border-gray-200 rounded-xl px-3 text-right text-sm font-body focus:border-purple focus:outline-none"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  {/* Botón full-width */}
                  <button
                    onClick={handleAddItem}
                    disabled={!newItemForm.name.trim() || savingAction === 'additem'}
                    className="w-full bg-purple text-white font-heading font-semibold py-3 min-h-[48px] rounded-xl text-sm disabled:opacity-50 transition-opacity"
                  >
                    {savingAction === 'additem' ? 'Guardando...' : 'Agregar a la factura'}
                  </button>
                </div>
              )}

              <div className="border-t border-gray-100 pt-3 mt-2 space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-heading">{formatCurrency(liveItemsTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Descuento</span>
                  {liveDisc > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-semibold text-green-600">-{formatCurrency(liveDisc)}{order.discount_type === 'percent' ? ` (${order.discount}%)` : ''}</span>
                      <button onClick={() => { if (window.confirm(`¿Quitar el descuento de ${formatCurrency(liveDisc)}?`)) saveDiscount(0, 'fixed'); }} className="text-gray-400 hover:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Quitar descuento">{'✕'}</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <div className="flex border border-gray-200 rounded overflow-hidden">
                        <button onClick={() => setDiscountType('fixed')} className={`px-2 py-1 text-xs font-heading font-semibold ${discountType === 'fixed' ? 'bg-purple text-white' : 'bg-gray-50 text-gray-400'}`}>$</button>
                        <button onClick={() => setDiscountType('percent')} className={`px-2 py-1 text-xs font-heading font-semibold ${discountType === 'percent' ? 'bg-purple text-white' : 'bg-gray-50 text-gray-400'}`}>%</button>
                      </div>
                      <input type="number" inputMode="decimal" value={discountInput} onChange={e => setDiscountInput(e.target.value)} placeholder={discountType === 'percent' ? '10' : '$0'} min="0" step={discountType === 'percent' ? '1' : '0.01'} className="w-16 border border-gray-200 rounded px-2 min-h-[44px] text-right text-sm" />
                      {discountInput && <button onClick={() => saveDiscount()} disabled={savingAction === 'discount'} className="text-xs font-heading font-semibold text-purple hover:underline disabled:opacity-50">Aplicar</button>}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Transporte</span>
                  {order.transport_cost_confirmed !== null && !isEditingTransport ? (
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-semibold text-gray-700">{liveTrans > 0 ? formatCurrency(liveTrans) : '$0 (gratis)'}</span>
                      <button onClick={() => { setIsEditingTransport(true); setTransportInput(String(liveTrans)); }} className="text-gray-400 hover:text-orange min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Editar transporte">✎</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input type="number" inputMode="decimal" value={transportInput} onChange={e => setTransportInput(e.target.value)} placeholder="$0" min="0" step="0.01" className="w-20 border border-orange/40 rounded px-2 min-h-[44px] text-right text-sm bg-orange/5" />
                      <button onClick={saveTransport} disabled={!transportInput || savingAction === 'transport'} className="min-h-[44px] px-2 text-sm font-heading font-semibold text-orange hover:underline disabled:opacity-50">Confirmar</button>
                      {isEditingTransport && <button onClick={() => setIsEditingTransport(false)} className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Cancelar">✕</button>}
                    </div>
                  )}
                </div>
                {/* Método de pago: mismo patrón que Transporte (valor + lápiz).
                    Sin `window.confirm` porque es reversible — se vuelve a tocar
                    el lápiz y se elige el otro. El recargo del 5 % lo calcula la
                    base al guardar, no este componente. */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Pago</span>
                  {!isEditingPayment ? (
                    <div className="flex items-center gap-2">
                      <span className="font-heading">
                        {payMethodLabel}
                        {liveSurch > 0 && <span className="text-orange"> · +{formatCurrency(liveSurch)} recargo</span>}
                      </span>
                      <button
                        onClick={() => setIsEditingPayment(true)}
                        className="text-gray-400 hover:text-orange min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="Editar método de pago"
                      >✎</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <div className="flex border border-gray-200 rounded overflow-hidden">
                        <button
                          onClick={() => savePaymentMethod('bank_transfer')}
                          disabled={savingAction === 'payment'}
                          aria-pressed={order.payment_method !== 'credit_card'}
                          aria-label="Cobrar por transferencia"
                          className={`px-2 min-h-[44px] min-w-[44px] text-xs font-heading font-semibold disabled:opacity-50 ${order.payment_method !== 'credit_card' ? 'bg-purple text-white' : 'bg-gray-50 text-gray-400'}`}
                        >Transferencia</button>
                        <button
                          onClick={() => savePaymentMethod('credit_card')}
                          disabled={savingAction === 'payment'}
                          aria-pressed={order.payment_method === 'credit_card'}
                          aria-label="Cobrar con tarjeta, con 5% de recargo"
                          className={`px-2 min-h-[44px] min-w-[44px] text-xs font-heading font-semibold disabled:opacity-50 ${order.payment_method === 'credit_card' ? 'bg-purple text-white' : 'bg-gray-50 text-gray-400'}`}
                        >Tarjeta +5%</button>
                      </div>
                      <button
                        onClick={() => setIsEditingPayment(false)}
                        className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="Cancelar"
                      >{'✕'}</button>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-baseline border-t border-gray-100 pt-4 mt-2">
                  <span className="font-heading text-base text-gray-700">Total</span>
                  <span className="font-heading font-semibold text-xl text-purple">{formatCurrency(liveTotal)}</span>
                </div>
              </div>

              {hasPendingItemEdits && (
                <div className="pt-3 flex gap-2">
                  <button
                    onClick={() => {
                      // Reset itemEdits a los valores actuales del order
                      if (!order) return;
                      const sync: Record<number, { quantity: string; unit_price: string }> = {};
                      for (const i of order.items) {
                        if (i.id) sync[i.id] = { quantity: String(i.quantity), unit_price: String(i.unit_price) };
                      }
                      setItemEdits(sync);
                    }}
                    className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-2 rounded-xl text-sm"
                  >
                    Cancelar
                  </button>
                  <button onClick={saveItemEdits} disabled={savingAction === 'items'} className="flex-1 bg-purple text-white font-heading font-semibold py-2 rounded-xl text-sm disabled:opacity-50">{savingAction === 'items' ? 'Guardando...' : 'Guardar'}</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* ─── DEPÓSITOS ─── */}
        <div>
          <button onClick={() => toggleSection('dep')} className="w-full flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
            <span className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider">Depósitos</span>
            <div className="flex items-center gap-3 text-xs">
              {totalDeposits > 0 && <span className="text-purple font-heading font-bold">Saldo: {formatCurrency(balance)}</span>}
              <span className="text-gray-400">{openSections.dep ? '▾' : '▸'}</span>
            </div>
          </button>
          {totalDeposits > 0 && (
            <div className="pt-2"><div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-teal h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, liveTotal > 0 ? (totalDeposits / liveTotal) * 100 : 0)}%` }} /></div></div>
          )}
          {openSections.dep && (
            <div className="pt-3 space-y-2">
              {(order.deposits || []).map((d, i) => (
                <div key={d.id || i} className="flex items-center justify-between text-sm py-1.5">
                  <span className="font-body text-gray-600">{d.date}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-semibold text-teal">{formatCurrency(d.amount)}</span>
                    <button onClick={() => removeDeposit(d)} className="text-gray-400 hover:text-red-500 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Eliminar depósito">✕</button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <input type="date" value={depositDate || panamaToday()} onChange={e => setDepositDate(e.target.value)} className="border border-gray-200 rounded-lg min-h-[44px] px-2 font-body text-sm" />
                <input type="number" inputMode="decimal" value={depositInput} onChange={e => setDepositInput(e.target.value)} placeholder={liveTotal > 0 ? formatCurrency(balance) : '$0.00'} min="0" step="0.01" className="flex-1 border border-gray-200 rounded-lg min-h-[44px] px-2.5 font-body text-sm" />
                <button onClick={addDeposit} disabled={!depositInput || savingAction === 'deposit'} className="bg-teal text-white font-heading font-semibold px-3 min-h-[44px] rounded-lg text-sm disabled:opacity-40">{savingAction === 'deposit' ? '...' : 'Registrar'}</button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* ─── NOTA INTERNA ─── */}
        <div>
          <button onClick={() => toggleSection('note')} className="w-full flex items-center justify-between py-1 hover:opacity-80 transition-opacity">
            <span className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider">Nota interna</span>
            <span className="text-gray-400 text-xs">{openSections.note ? '▾' : '▸'}</span>
          </button>
          {openSections.note && (
            <div className="pt-3">
              <textarea
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                onBlur={saveNote}
                placeholder="Agregar nota interna (auto-guarda al perder foco)..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 font-body text-sm focus:border-purple focus:outline-none resize-none"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
