'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { fetchLogoUrl } from '@/lib/supabase-data';
import { CONTACT } from '@/lib/constants';

// ─── Session (shared with /admin via sessionStorage) ───
let _adminToken = '';
let _adminPin = '';

function adminHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-admin-token': _adminToken, 'x-admin-pin': _adminPin };
}

/**
 * Attachments live in a PRIVATE bucket. We store only the storage path and
 * request a fresh 1h signed URL on demand. The window is opened synchronously
 * (before the await) so iOS Safari doesn't block it as a non-gesture popup.
 */
async function openAttachment(path: string, showToast: (m: string) => void): Promise<void> {
  const w = window.open('', '_blank');
  try {
    const res = await fetch(`/api/accounting?resource=attachment&path=${encodeURIComponent(path)}`, { headers: adminHeaders() });
    const d = await res.json();
    if (res.ok && d.url) {
      if (w) w.location.href = d.url;
      else window.location.href = d.url;
    } else {
      if (w) w.close();
      showToast(d.error || 'No se pudo abrir el adjunto');
    }
  } catch {
    if (w) w.close();
    showToast('Error al abrir adjunto');
  }
}

// ─── Types ───
interface Account {
  id: string;
  name: string;
  type: string;
  initial_balance: number;
  is_active: boolean;
  created_at?: string;
  balance?: number;
}

interface Category {
  id: string;
  name: string;
  kind: 'ingreso' | 'gasto';
  is_active: boolean;
}

interface OrderLite {
  id: number;
  order_number: number;
  customer_name: string;
  event_date: string;
  total: number;
}

interface Voucher {
  id: string;
  voucher_number: number;
  kind: 'ingreso' | 'egreso';
  date: string;
  account_id: string | null;
  category_id: string | null;
  order_id: number | null;
  counterparty: string | null;
  description: string | null;
  amount: number;
  payment_method: string | null;
  reference: string | null;
  attachment_url: string | null;
  status: 'activo' | 'anulado';
  notes: string | null;
  created_at: string;
  account_name?: string | null;
  category_name?: string | null;
}

const ACCOUNT_TYPES = ['banco', 'efectivo', 'yappy', 'tarjeta'];
const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Yappy', 'Tarjeta', 'Cheque', 'ACH', 'Otro'];

// ─── Helpers ───
function voucherCode(v: { kind: string; voucher_number: number }): string {
  return `${v.kind === 'ingreso' ? 'CI' : 'CE'}-${String(v.voucher_number).padStart(4, '0')}`;
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDate(s: string): string {
  if (!s) return '';
  try {
    return parseLocalDate(s).toLocaleDateString('es-PA', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return s;
  }
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function categoryKindFor(voucherKind: 'ingreso' | 'egreso'): 'ingreso' | 'gasto' {
  return voucherKind === 'ingreso' ? 'ingreso' : 'gasto';
}

// Date range presets
type PresetKey = 'mes' | 'mesPasado' | 'anio' | 'todo';
function presetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (key === 'mes') return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)) };
  if (key === 'mesPasado') return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
  if (key === 'anio') return { from: fmt(new Date(y, 0, 1)), to: fmt(new Date(y, 11, 31)) };
  return { from: '', to: '' };
}

const INPUT_CLS = 'w-full border border-gray-200 rounded-lg py-2.5 px-3 font-body text-base focus:border-purple focus:outline-none bg-white';
const LABEL_CLS = 'block font-heading font-semibold text-xs text-gray-500 mb-1';

// ─── MAIN PAGE ───
export default function ContabilidadPage() {
  const { showToast } = useToast();
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'comprobantes' | 'cuentas' | 'categorias'>('comprobantes');

  // Shared data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('adminToken');
      const p = sessionStorage.getItem('adminPin');
      if (t && p) {
        _adminToken = t;
        _adminPin = p;
        setAuthed(true);
      }
    } catch {}
    setReady(true);
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting?resource=accounts', { headers: adminHeaders() });
      if (res.ok) {
        const d = await res.json();
        setAccounts(d.accounts || []);
      }
    } catch {}
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting?resource=categories', { headers: adminHeaders() });
      if (res.ok) {
        const d = await res.json();
        setCategories(d.categories || []);
      }
    } catch {}
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting?resource=orders', { headers: adminHeaders() });
      if (res.ok) {
        const d = await res.json();
        setOrders(d.orders || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadAccounts();
    loadCategories();
    loadOrders();
    fetchLogoUrl().then(setLogoUrl).catch(() => {});
  }, [authed, loadAccounts, loadCategories, loadOrders]);

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
        try {
          sessionStorage.setItem('adminToken', _adminToken);
          sessionStorage.setItem('adminPin', _adminPin);
          sessionStorage.setItem('adminRole', data.role || 'admin');
        } catch {}
        setAuthed(true);
      } else {
        setError(data.error || 'PIN incorrecto');
      }
    } catch {
      setError('Error de conexión');
    }
  };

  if (!ready) return null;

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream px-4">
        <form onSubmit={handleLogin} className="bg-white rounded-3xl p-8 shadow-lg max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-purple/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">💰</span>
            </div>
            <h1 className="font-heading font-bold text-2xl text-purple">Contabilidad</h1>
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
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-gray-400 hover:text-purple transition-colors" aria-label="Volver al admin">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-heading font-bold text-2xl text-purple">Contabilidad</h1>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        {([['comprobantes', 'Comprobantes'], ['cuentas', 'Cuentas'], ['categorias', 'Categorías']] as const).map(([t, label]) => (
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

      {tab === 'comprobantes' && (
        <ComprobantesTab
          accounts={accounts}
          categories={categories}
          orders={orders}
          logoUrl={logoUrl}
          onMutated={loadAccounts}
          showToast={showToast}
        />
      )}
      {tab === 'cuentas' && (
        <CuentasTab accounts={accounts} reload={loadAccounts} showToast={showToast} />
      )}
      {tab === 'categorias' && (
        <CategoriasTab categories={categories} reload={loadCategories} showToast={showToast} />
      )}
    </div>
  );
}

// ─── COMPROBANTES TAB ───
function ComprobantesTab({
  accounts, categories, orders, logoUrl, onMutated, showToast,
}: {
  accounts: Account[];
  categories: Category[];
  orders: OrderLite[];
  logoUrl: string | null;
  onMutated: () => void;
  showToast: (m: string) => void;
}) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<PresetKey>('mes');
  const [from, setFrom] = useState(presetRange('mes').from);
  const [to, setTo] = useState(presetRange('mes').to);
  const [kindFilter, setKindFilter] = useState<'' | 'ingreso' | 'egreso'>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [formKind, setFormKind] = useState<'ingreso' | 'egreso' | null>(null);
  const [detail, setDetail] = useState<Voucher | null>(null);
  const [printing, setPrinting] = useState<Voucher | null>(null);

  const loadVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ resource: 'vouchers' });
      if (from) params.set('dateFrom', from);
      if (to) params.set('dateTo', to);
      if (kindFilter) params.set('kind', kindFilter);
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (accountFilter) params.set('accountId', accountFilter);
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/accounting?${params.toString()}`, { headers: adminHeaders() });
      if (res.ok) {
        const d = await res.json();
        setVouchers(d.vouchers || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [from, to, kindFilter, categoryFilter, accountFilter, search]);

  useEffect(() => {
    const t = setTimeout(loadVouchers, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [loadVouchers, search]);

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    const r = presetRange(key);
    setFrom(r.from);
    setTo(r.to);
  };

  const totals = useMemo(() => {
    let ingresos = 0, egresos = 0;
    for (const v of vouchers) {
      if (v.status !== 'activo') continue;
      if (v.kind === 'ingreso') ingresos += Number(v.amount) || 0;
      else egresos += Number(v.amount) || 0;
    }
    return { ingresos, egresos, neto: ingresos - egresos };
  }, [vouchers]);

  const afterCreate = () => {
    setFormKind(null);
    loadVouchers();
    onMutated();
  };

  const handleVoid = async (v: Voucher) => {
    if (!confirm(`¿Anular el comprobante ${voucherCode(v)}? No se elimina, queda marcado como anulado y deja de sumar en los totales.`)) return;
    try {
      const res = await fetch('/api/accounting', {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ resource: 'voucher_void', id: v.id }),
      });
      if (res.ok) {
        showToast('Comprobante anulado');
        setDetail(null);
        loadVouchers();
        onMutated();
      } else {
        showToast('Error al anular');
      }
    } catch {
      showToast('Error de conexión');
    }
  };

  return (
    <div>
      {/* Totals */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="font-heading text-[11px] text-emerald-700 font-semibold uppercase tracking-wide">Ingresos</p>
          <p className="font-heading font-bold text-emerald-700 text-base mt-0.5">{formatCurrency(totals.ingresos)}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <p className="font-heading text-[11px] text-red-600 font-semibold uppercase tracking-wide">Egresos</p>
          <p className="font-heading font-bold text-red-600 text-base mt-0.5">{formatCurrency(totals.egresos)}</p>
        </div>
        <div className="bg-purple/10 rounded-xl p-3 text-center">
          <p className="font-heading text-[11px] text-purple font-semibold uppercase tracking-wide">Neto</p>
          <p className="font-heading font-bold text-purple text-base mt-0.5">{formatCurrency(totals.neto)}</p>
        </div>
      </div>

      {/* New buttons */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setFormKind('ingreso')}
          className="bg-emerald-600 text-white font-heading font-bold py-3 rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
        >
          <span className="text-lg leading-none">+</span> Nuevo ingreso
        </button>
        <button
          onClick={() => setFormKind('egreso')}
          className="bg-red-500 text-white font-heading font-bold py-3 rounded-xl hover:bg-red-600 transition-colors flex items-center justify-center gap-1.5"
        >
          <span className="text-lg leading-none">−</span> Nuevo egreso
        </button>
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar contraparte, descripción, referencia…"
          className="flex-1 border border-gray-200 rounded-lg py-2.5 px-3 font-body text-base focus:border-purple focus:outline-none"
        />
        <button
          onClick={() => setShowFilters(s => !s)}
          className={`px-3 rounded-lg font-heading font-semibold text-sm border transition-colors ${showFilters ? 'bg-purple text-white border-purple' : 'bg-white text-gray-600 border-gray-200'}`}
          aria-label="Filtros"
        >
          Filtros
        </button>
      </div>

      {/* Date presets */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {([['mes', 'Este mes'], ['mesPasado', 'Mes pasado'], ['anio', 'Este año'], ['todo', 'Todo']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => applyPreset(k)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full font-heading font-semibold text-xs transition-colors ${preset === k ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL_CLS}>Desde</label>
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('todo'); }} className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Hasta</label>
              <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset('todo'); }} className={INPUT_CLS} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={LABEL_CLS}>Tipo</label>
              <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as '' | 'ingreso' | 'egreso')} className={INPUT_CLS}>
                <option value="">Todos</option>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Categoría</label>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={INPUT_CLS}>
                <option value="">Todas</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Cuenta</label>
              <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className={INPUT_CLS}>
                <option value="">Todas</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : vouchers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">🧾</p>
          <p className="font-body">No hay comprobantes en este rango</p>
        </div>
      ) : (
        <div className="space-y-2">
          {vouchers.map(v => {
            const anulado = v.status === 'anulado';
            return (
              <button
                key={v.id}
                onClick={() => setDetail(v)}
                className={`w-full text-left bg-white border rounded-xl p-3 flex items-center gap-3 transition-shadow hover:shadow-sm ${anulado ? 'opacity-50 border-gray-200' : 'border-gray-200'}`}
              >
                <div className={`w-1.5 self-stretch rounded-full ${v.kind === 'ingreso' ? 'bg-emerald-500' : 'bg-red-500'} ${anulado ? 'opacity-40' : ''}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`font-heading font-bold text-xs ${v.kind === 'ingreso' ? 'text-emerald-700' : 'text-red-600'} ${anulado ? 'line-through' : ''}`}>{voucherCode(v)}</span>
                    {anulado && <span className="text-[10px] font-heading font-bold text-gray-400 uppercase">Anulado</span>}
                    <span className="text-[11px] text-gray-400 font-body">{formatDate(v.date)}</span>
                  </div>
                  <p className={`font-body text-sm text-gray-800 truncate ${anulado ? 'line-through' : ''}`}>
                    {v.counterparty || v.description || v.category_name || '—'}
                  </p>
                  <p className="text-[11px] text-gray-400 font-body truncate">
                    {v.category_name || 'Sin categoría'}{v.account_name ? ` · ${v.account_name}` : ''}
                  </p>
                </div>
                <div className={`font-heading font-bold text-sm whitespace-nowrap ${anulado ? 'text-gray-400 line-through' : v.kind === 'ingreso' ? 'text-emerald-700' : 'text-red-600'}`}>
                  {v.kind === 'ingreso' ? '+' : '−'}{formatCurrency(Number(v.amount) || 0)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {formKind && (
        <VoucherFormModal
          kind={formKind}
          accounts={accounts.filter(a => a.is_active)}
          categories={categories.filter(c => c.is_active && c.kind === categoryKindFor(formKind))}
          orders={orders}
          onClose={() => setFormKind(null)}
          onCreated={afterCreate}
          showToast={showToast}
        />
      )}

      {detail && (
        <VoucherDetailModal
          voucher={detail}
          onClose={() => setDetail(null)}
          onVoid={() => handleVoid(detail)}
          onPrint={() => { setPrinting(detail); }}
          showToast={showToast}
        />
      )}

      {printing && (
        <VoucherPrint
          voucher={printing}
          logoUrl={logoUrl}
          onClose={() => setPrinting(null)}
        />
      )}
    </div>
  );
}

// ─── VOUCHER FORM MODAL ───
function VoucherFormModal({
  kind, accounts, categories, orders, onClose, onCreated, showToast,
}: {
  kind: 'ingreso' | 'egreso';
  accounts: Account[];
  categories: Category[];
  orders: OrderLite[];
  onClose: () => void;
  onCreated: () => void;
  showToast: (m: string) => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [orderId, setOrderId] = useState('');
  const [attachmentPath, setAttachmentPath] = useState('');
  const [attachmentSigned, setAttachmentSigned] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isIngreso = kind === 'ingreso';

  const handleOrderSelect = (val: string) => {
    setOrderId(val);
    if (!val) return;
    const o = orders.find(ord => String(ord.id) === val);
    if (o) {
      if (!counterparty) setCounterparty(o.customer_name || '');
      if (!description) setDescription(`Pago pedido #${o.order_number}`);
      if (!amount && o.total) setAmount(String(o.total));
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/accounting/upload', {
        method: 'POST',
        headers: { 'x-admin-token': _adminToken, 'x-admin-pin': _adminPin },
        body: fd,
      });
      const d = await res.json();
      if (res.ok && d.path) {
        setAttachmentPath(d.path);
        setAttachmentSigned(d.url || '');
        showToast('Adjunto subido');
      } else {
        showToast(d.error || 'Error al subir adjunto');
      }
    } catch {
      showToast('Error al subir adjunto');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) { showToast('El monto debe ser mayor a 0'); return; }
    if (!accountId) { showToast('Selecciona una cuenta'); return; }
    if (!categoryId) { showToast('Selecciona una categoría'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/accounting', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          resource: 'voucher',
          kind,
          date,
          account_id: accountId,
          category_id: categoryId,
          order_id: isIngreso && orderId ? Number(orderId) : null,
          counterparty: counterparty.trim() || null,
          description: description.trim() || null,
          amount: amt,
          payment_method: paymentMethod || null,
          reference: reference.trim() || null,
          attachment_url: attachmentPath || null,
          notes: notes.trim() || null,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        showToast(`${isIngreso ? 'Ingreso' : 'Egreso'} guardado`);
        onCreated();
      } else {
        showToast(d.error || 'Error al guardar');
      }
    } catch {
      showToast('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`sticky top-0 z-10 px-5 py-4 flex items-center justify-between ${isIngreso ? 'bg-emerald-600' : 'bg-red-500'} text-white rounded-t-3xl`}>
          <h2 className="font-heading font-bold text-lg">{isIngreso ? 'Nuevo ingreso' : 'Nuevo egreso'}</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {isIngreso && (
            <div>
              <label className={LABEL_CLS}>Vincular a pedido (opcional)</label>
              <select value={orderId} onChange={(e) => handleOrderSelect(e.target.value)} className={INPUT_CLS}>
                <option value="">Sin pedido</option>
                {orders.map(o => (
                  <option key={o.id} value={String(o.id)}>
                    #{o.order_number} · {o.customer_name} · {formatDate(o.event_date)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Fecha</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Monto *</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Cuenta *</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={INPUT_CLS}>
                <option value="">Selecciona…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Categoría *</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={INPUT_CLS}>
                <option value="">Selecciona…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Contraparte</label>
            <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={isIngreso ? 'Cliente' : 'Proveedor'} className={INPUT_CLS} />
          </div>

          <div>
            <label className={LABEL_CLS}>Descripción</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Concepto" className={INPUT_CLS} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Método de pago</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={INPUT_CLS}>
                <option value="">—</option>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Referencia</label>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N.º transacción" className={INPUT_CLS} />
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Adjunto (foto o PDF)</label>
            {attachmentPath ? (
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                <span className="text-sm text-gray-600 truncate flex-1">📎 Adjunto cargado</span>
                <button
                  type="button"
                  onClick={() => { if (attachmentSigned) window.open(attachmentSigned, '_blank', 'noopener'); else openAttachment(attachmentPath, showToast); }}
                  className="text-purple text-sm font-semibold"
                >
                  Ver
                </button>
                <button onClick={() => { setAttachmentPath(''); setAttachmentSigned(''); }} className="text-red-500 text-sm font-semibold">Quitar</button>
              </div>
            ) : (
              <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg py-3 cursor-pointer text-gray-500 text-sm ${uploading ? 'opacity-50' : 'hover:border-purple'}`}>
                {uploading ? 'Subiendo…' : '📎 Subir archivo'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                />
              </label>
            )}
          </div>

          <div>
            <label className={LABEL_CLS}>Notas</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notas internas" className={INPUT_CLS} />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-heading font-bold text-gray-500 bg-gray-100">Cancelar</button>
          <button
            onClick={submit}
            disabled={saving || uploading}
            className={`flex-1 py-3 rounded-xl font-heading font-bold text-white ${isIngreso ? 'bg-emerald-600' : 'bg-red-500'} disabled:opacity-50`}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VOUCHER DETAIL MODAL ───
function VoucherDetailModal({
  voucher, onClose, onVoid, onPrint, showToast,
}: {
  voucher: Voucher;
  onClose: () => void;
  onVoid: () => void;
  onPrint: () => void;
  showToast: (m: string) => void;
}) {
  const v = voucher;
  const isIngreso = v.kind === 'ingreso';
  const anulado = v.status === 'anulado';
  const rows: { label: string; value: string }[] = [
    { label: 'Fecha', value: formatDate(v.date) },
    { label: 'Tipo', value: isIngreso ? 'Ingreso' : 'Egreso' },
    { label: 'Categoría', value: v.category_name || '—' },
    { label: 'Cuenta', value: v.account_name || '—' },
    { label: 'Contraparte', value: v.counterparty || '—' },
    { label: 'Descripción', value: v.description || '—' },
    { label: 'Método de pago', value: v.payment_method || '—' },
    { label: 'Referencia', value: v.reference || '—' },
    { label: 'Notas', value: v.notes || '—' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className={`px-5 py-4 ${isIngreso ? 'bg-emerald-600' : 'bg-red-500'} text-white rounded-t-3xl`}>
          <div className="flex items-center justify-between">
            <span className="font-heading font-bold text-lg">{voucherCode(v)}</span>
            <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
          </div>
          <p className={`font-heading font-bold text-2xl mt-1 ${anulado ? 'line-through opacity-70' : ''}`}>
            {isIngreso ? '+' : '−'}{formatCurrency(Number(v.amount) || 0)}
          </p>
          {anulado && <span className="inline-block mt-1 text-[11px] font-heading font-bold uppercase bg-white/20 px-2 py-0.5 rounded">Anulado</span>}
        </div>

        <div className="p-5 space-y-2.5">
          {rows.map(r => (
            <div key={r.label} className="flex justify-between gap-3 text-sm">
              <span className="font-heading font-semibold text-gray-400">{r.label}</span>
              <span className="font-body text-gray-800 text-right">{r.value}</span>
            </div>
          ))}
          {v.attachment_url && (
            <button
              type="button"
              onClick={() => openAttachment(v.attachment_url as string, showToast)}
              className="block w-full text-center bg-gray-50 rounded-lg py-2.5 text-purple font-heading font-semibold text-sm mt-2"
            >
              📎 Ver adjunto
            </button>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-2">
          <button onClick={onPrint} className="flex-1 py-3 rounded-xl font-heading font-bold text-purple bg-purple/10">
            🖨️ Imprimir
          </button>
          {!anulado && (
            <button onClick={onVoid} className="flex-1 py-3 rounded-xl font-heading font-bold text-red-600 bg-red-50">
              Anular
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PRINTABLE VOUCHER ───
function VoucherPrint({ voucher, logoUrl, onClose }: { voucher: Voucher; logoUrl: string | null; onClose: () => void }) {
  const v = voucher;
  const isIngreso = v.kind === 'ingreso';

  useEffect(() => {
    const t = setTimeout(() => window.print(), 250);
    const after = () => onClose();
    window.addEventListener('afterprint', after);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', after); };
  }, [onClose]);

  const rows: { label: string; value: string }[] = [
    { label: 'Fecha', value: formatDate(v.date) },
    { label: 'Categoría', value: v.category_name || '—' },
    { label: 'Cuenta', value: v.account_name || '—' },
    { label: 'Contraparte', value: v.counterparty || '—' },
    { label: 'Descripción', value: v.description || '—' },
    { label: 'Método de pago', value: v.payment_method || '—' },
    { label: 'Referencia', value: v.reference || '—' },
  ];

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #voucher-print, #voucher-print * { visibility: visible !important; }
          #voucher-print { position: absolute; left: 0; top: 0; width: 100%; padding: 32px; }
          @page { margin: 16mm; }
        }
      `}</style>

      {/* Screen overlay with close fallback */}
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 print:hidden" onClick={onClose}>
        <div className="bg-white rounded-2xl p-6 max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
          <p className="font-heading font-bold text-purple mb-2">Imprimiendo comprobante…</p>
          <p className="font-body text-sm text-gray-500 mb-4">Si no se abrió el diálogo de impresión, usa el botón.</p>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="flex-1 py-2.5 rounded-xl bg-purple text-white font-heading font-bold">Imprimir</button>
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-heading font-bold">Cerrar</button>
          </div>
        </div>
      </div>

      <div id="voucher-print" className="hidden print:block font-body text-gray-900">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #580459', paddingBottom: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 'bold', color: '#580459', margin: 0 }}>Playtime S.A.</h1>
            <p style={{ fontSize: 12, color: '#555', margin: '4px 0 0' }}>{CONTACT.phone}</p>
            <p style={{ fontSize: 12, color: '#555', margin: 0 }}>{CONTACT.email}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            {logoUrl && <img src={logoUrl} alt="PlayTime" style={{ height: 56, marginLeft: 'auto', marginBottom: 8 }} />}
            <p style={{ fontSize: 13, fontWeight: 'bold', color: isIngreso ? '#047857' : '#dc2626', margin: 0 }}>
              COMPROBANTE DE {isIngreso ? 'INGRESO' : 'EGRESO'}
            </p>
            <p style={{ fontSize: 18, fontWeight: 'bold', margin: '2px 0 0' }}>{voucherCode(v)}</p>
          </div>
        </div>

        {v.status === 'anulado' && (
          <p style={{ color: '#dc2626', fontWeight: 'bold', fontSize: 16, marginBottom: 16 }}>*** ANULADO ***</p>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td style={{ padding: '8px 0', fontWeight: 'bold', color: '#580459', width: '35%', verticalAlign: 'top', fontSize: 13 }}>{r.label}</td>
                <td style={{ padding: '8px 0', fontSize: 13 }}>{r.value}</td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: '12px 0 0', fontWeight: 'bold', color: '#580459', fontSize: 15, borderTop: '1px solid #ddd' }}>Monto</td>
              <td style={{ padding: '12px 0 0', fontWeight: 'bold', fontSize: 18, borderTop: '1px solid #ddd' }}>
                {formatCurrency(Number(v.amount) || 0)}
              </td>
            </tr>
          </tbody>
        </table>

        {v.notes && <p style={{ fontSize: 12, color: '#555', marginBottom: 32 }}><strong>Notas:</strong> {v.notes}</p>}

        <div style={{ marginTop: 64, display: 'flex', justifyContent: 'space-between', gap: 48 }}>
          <div style={{ flex: 1, textAlign: 'center', borderTop: '1px solid #333', paddingTop: 8, fontSize: 12 }}>Entregado por</div>
          <div style={{ flex: 1, textAlign: 'center', borderTop: '1px solid #333', paddingTop: 8, fontSize: 12 }}>Recibido por</div>
        </div>
      </div>
    </>
  );
}

// ─── CUENTAS TAB ───
function CuentasTab({ accounts, reload, showToast }: { accounts: Account[]; reload: () => void; showToast: (m: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('banco');
  const [newInitial, setNewInitial] = useState('');
  const [editing, setEditing] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('banco');
  const [movementsFor, setMovementsFor] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);

  const createAccount = async () => {
    if (!newName.trim()) { showToast('Nombre requerido'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/accounting', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ resource: 'account', name: newName.trim(), type: newType, initial_balance: Number(newInitial) || 0 }),
      });
      if (res.ok) {
        showToast('Cuenta creada');
        setCreating(false); setNewName(''); setNewType('banco'); setNewInitial('');
        reload();
      } else { showToast('Error al crear cuenta'); }
    } catch { showToast('Error de conexión'); }
    finally { setSaving(false); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) { showToast('Nombre requerido'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/accounting', {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ resource: 'account', id: editing.id, name: editName.trim(), type: editType }),
      });
      if (res.ok) { showToast('Cuenta actualizada'); setEditing(null); reload(); }
      else { showToast('Error al actualizar'); }
    } catch { showToast('Error de conexión'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (a: Account) => {
    try {
      const res = await fetch('/api/accounting', {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ resource: 'account', id: a.id, is_active: !a.is_active }),
      });
      if (res.ok) { showToast(a.is_active ? 'Cuenta desactivada' : 'Cuenta activada'); reload(); }
      else { showToast('Error'); }
    } catch { showToast('Error de conexión'); }
  };

  const startEdit = (a: Account) => {
    setEditing(a); setEditName(a.name); setEditType(a.type || 'banco');
  };

  return (
    <div>
      <div className="space-y-2 mb-4">
        {accounts.map(a => (
          <div key={a.id} className={`bg-white border rounded-xl p-4 ${a.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
            <div className="flex items-start justify-between">
              <button onClick={() => setMovementsFor(a)} className="text-left flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-bold text-gray-800">{a.name}</span>
                  <span className="text-[10px] font-heading font-semibold uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{a.type}</span>
                  {!a.is_active && <span className="text-[10px] font-heading font-semibold uppercase text-gray-400">Inactiva</span>}
                </div>
                <p className="font-heading font-bold text-xl text-purple mt-1">{formatCurrency(a.balance ?? a.initial_balance ?? 0)}</p>
                <p className="text-[11px] text-gray-400 font-body">Inicial: {formatCurrency(Number(a.initial_balance) || 0)} · Ver movimientos →</p>
              </button>
              <div className="flex flex-col gap-1 items-end">
                <button onClick={() => startEdit(a)} className="text-gray-400 hover:text-purple text-sm font-semibold">Editar</button>
                <button onClick={() => toggleActive(a)} className="text-gray-400 hover:text-gray-600 text-sm font-semibold">{a.is_active ? 'Desactivar' : 'Activar'}</button>
              </div>
            </div>
          </div>
        ))}
        {accounts.length === 0 && <p className="text-center text-gray-400 py-8 font-body">No hay cuentas todavía</p>}
      </div>

      {creating ? (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div>
            <label className={LABEL_CLS}>Nombre</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej. Banco Aliado" className={INPUT_CLS} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Tipo</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} className={INPUT_CLS}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Saldo inicial</label>
              <input type="number" inputMode="decimal" step="0.01" value={newInitial} onChange={(e) => setNewInitial(e.target.value)} placeholder="0.00" className={INPUT_CLS} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCreating(false)} className="flex-1 py-2.5 rounded-xl font-heading font-bold text-gray-500 bg-gray-100">Cancelar</button>
            <button onClick={createAccount} disabled={saving} className="flex-1 py-2.5 rounded-xl font-heading font-bold text-white bg-purple disabled:opacity-50">Crear</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 font-heading font-bold hover:border-purple hover:text-purple transition-colors">
          + Nueva cuenta
        </button>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading font-bold text-lg text-purple">Editar cuenta</h3>
            <div>
              <label className={LABEL_CLS}>Nombre</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>Tipo</label>
              <select value={editType} onChange={(e) => setEditType(e.target.value)} className={INPUT_CLS}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-xl font-heading font-bold text-gray-500 bg-gray-100">Cancelar</button>
              <button onClick={saveEdit} disabled={saving} className="flex-1 py-2.5 rounded-xl font-heading font-bold text-white bg-purple disabled:opacity-50">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {movementsFor && (
        <AccountMovementsModal account={movementsFor} onClose={() => setMovementsFor(null)} />
      )}
    </div>
  );
}

// ─── ACCOUNT MOVEMENTS (running balance) ───
function AccountMovementsModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/accounting?resource=vouchers&accountId=${account.id}&sort=asc`, { headers: adminHeaders() });
        if (res.ok) {
          const d = await res.json();
          setVouchers(d.vouchers || []);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, [account.id]);

  // Running balance over active vouchers
  let running = Number(account.initial_balance) || 0;
  const rows = vouchers.map(v => {
    const active = v.status === 'activo';
    const delta = active ? (v.kind === 'ingreso' ? Number(v.amount) : -Number(v.amount)) : 0;
    running += delta;
    return { v, balance: running };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-purple text-white px-5 py-4 flex items-center justify-between rounded-t-3xl">
          <div>
            <h2 className="font-heading font-bold text-lg">{account.name}</h2>
            <p className="text-white/80 text-sm font-body">Saldo: {formatCurrency(account.balance ?? account.initial_balance ?? 0)}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">×</button>
        </div>
        <div className="p-4">
          <div className="flex justify-between text-[11px] text-gray-400 font-heading font-semibold uppercase px-2 mb-1">
            <span>Saldo inicial</span>
            <span>{formatCurrency(Number(account.initial_balance) || 0)}</span>
          </div>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <p className="text-center text-gray-400 py-8 font-body">Sin movimientos</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {rows.map(({ v, balance }) => {
                const anulado = v.status === 'anulado';
                return (
                  <div key={v.id} className={`flex items-center gap-3 py-2.5 ${anulado ? 'opacity-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`font-body text-sm text-gray-800 truncate ${anulado ? 'line-through' : ''}`}>
                        {v.counterparty || v.description || v.category_name || voucherCode(v)}
                      </p>
                      <p className="text-[11px] text-gray-400 font-body">{voucherCode(v)} · {formatDate(v.date)}{anulado ? ' · Anulado' : ''}</p>
                    </div>
                    <div className={`font-heading font-bold text-sm whitespace-nowrap ${anulado ? 'text-gray-400 line-through' : v.kind === 'ingreso' ? 'text-emerald-700' : 'text-red-600'}`}>
                      {v.kind === 'ingreso' ? '+' : '−'}{formatCurrency(Number(v.amount) || 0)}
                    </div>
                    <div className="font-body text-xs text-gray-500 whitespace-nowrap w-20 text-right">{formatCurrency(balance)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CATEGORÍAS TAB ───
function CategoriasTab({ categories, reload, showToast }: { categories: Category[]; reload: () => void; showToast: (m: string) => void }) {
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'ingreso' | 'gasto'>('ingreso');
  const [saving, setSaving] = useState(false);

  const ingresos = categories.filter(c => c.kind === 'ingreso');
  const gastos = categories.filter(c => c.kind === 'gasto');

  const createCategory = async () => {
    if (!newName.trim()) { showToast('Nombre requerido'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/accounting', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ resource: 'category', name: newName.trim(), kind: newKind }),
      });
      if (res.ok) { showToast('Categoría creada'); setNewName(''); reload(); }
      else { showToast('Error al crear categoría'); }
    } catch { showToast('Error de conexión'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (c: Category) => {
    try {
      const res = await fetch('/api/accounting', {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ resource: 'category', id: c.id, is_active: !c.is_active }),
      });
      if (res.ok) { showToast(c.is_active ? 'Categoría desactivada' : 'Categoría activada'); reload(); }
      else { showToast('Error'); }
    } catch { showToast('Error de conexión'); }
  };

  const renderGroup = (title: string, list: Category[], color: string) => (
    <div>
      <h3 className={`font-heading font-bold text-sm uppercase tracking-wide mb-2 ${color}`}>{title}</h3>
      <div className="space-y-1.5">
        {list.length === 0 && <p className="text-gray-400 text-sm font-body">Sin categorías</p>}
        {list.map(c => (
          <div key={c.id} className={`flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2.5 ${c.is_active ? '' : 'opacity-55'}`}>
            <span className={`font-body text-sm text-gray-800 ${c.is_active ? '' : 'line-through'}`}>{c.name}</span>
            <button onClick={() => toggleActive(c)} className="text-gray-400 hover:text-gray-600 text-xs font-heading font-semibold">
              {c.is_active ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 rounded-xl p-4">
        <label className={LABEL_CLS}>Nueva categoría</label>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre" className={`${INPUT_CLS} flex-1`} />
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as 'ingreso' | 'gasto')} className={`${INPUT_CLS} w-28`}>
            <option value="ingreso">Ingreso</option>
            <option value="gasto">Gasto</option>
          </select>
          <button onClick={createCategory} disabled={saving} className="px-4 rounded-lg font-heading font-bold text-white bg-purple disabled:opacity-50">+</button>
        </div>
      </div>

      {renderGroup('Ingresos', ingresos, 'text-emerald-700')}
      {renderGroup('Gastos', gastos, 'text-red-600')}
    </div>
  );
}
