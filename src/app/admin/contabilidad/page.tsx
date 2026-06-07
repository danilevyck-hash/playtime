'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/format';
import { useToast } from '@/context/ToastContext';
import { fetchLogoUrl } from '@/lib/supabase-data';
import { CONTACT } from '@/lib/constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// ─── Session (shared with /admin via sessionStorage) ───
let _adminToken = '';

function adminHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-admin-token': _adminToken };
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
  deposit_amount?: number | null;
  status?: string | null;
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

// ─── Report period helpers ───
type ReportPeriodKey = 'mes' | 'mesPasado' | 'trimestre' | 'anio' | 'custom';
const REPORT_PRESETS: { key: ReportPeriodKey; label: string }[] = [
  { key: 'mes', label: 'Este mes' },
  { key: 'mesPasado', label: 'Mes pasado' },
  { key: 'trimestre', label: 'Últimos 3 meses' },
  { key: 'anio', label: 'Este año' },
  { key: 'custom', label: 'Rango' },
];
const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function reportRange(key: ReportPeriodKey): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === 'mes') return { from: fmtDate(new Date(y, m, 1)), to: fmtDate(new Date(y, m + 1, 0)) };
  if (key === 'mesPasado') return { from: fmtDate(new Date(y, m - 1, 1)), to: fmtDate(new Date(y, m, 0)) };
  if (key === 'trimestre') return { from: fmtDate(new Date(y, m - 2, 1)), to: fmtDate(new Date(y, m + 1, 0)) };
  if (key === 'anio') return { from: fmtDate(new Date(y, 0, 1)), to: fmtDate(new Date(y, 11, 31)) };
  return { from: fmtDate(new Date(y, m, 1)), to: fmtDate(new Date(y, m + 1, 0)) };
}

/** Previous comparable period for P&L comparison. */
function previousReportRange(key: ReportPeriodKey, from: string, to: string): { from: string; to: string } {
  const f = parseLocalDate(from);
  const t = parseLocalDate(to);
  if (key === 'mes' || key === 'mesPasado') {
    return { from: fmtDate(new Date(f.getFullYear(), f.getMonth() - 1, 1)), to: fmtDate(new Date(f.getFullYear(), f.getMonth(), 0)) };
  }
  if (key === 'trimestre') {
    return { from: fmtDate(new Date(f.getFullYear(), f.getMonth() - 3, 1)), to: fmtDate(new Date(f.getFullYear(), f.getMonth(), 0)) };
  }
  if (key === 'anio') {
    return { from: fmtDate(new Date(f.getFullYear() - 1, 0, 1)), to: fmtDate(new Date(f.getFullYear() - 1, 11, 31)) };
  }
  // custom: shift back by equal-length window
  const lenMs = t.getTime() - f.getTime();
  const prevTo = new Date(f.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - lenMs);
  return { from: fmtDate(prevFrom), to: fmtDate(prevTo) };
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function monthKey(dateStr: string): string { return dateStr.slice(0, 7); } // YYYY-MM
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_ES[(m || 1) - 1]} ${String(y).slice(2)}`;
}
/** List of YYYY-MM month keys spanning [from, to] inclusive. */
function monthsInRange(from: string, to: string): string[] {
  const f = parseLocalDate(from);
  const t = parseLocalDate(to);
  const out: string[] = [];
  let y = f.getFullYear(), m = f.getMonth();
  while (y < t.getFullYear() || (y === t.getFullYear() && m <= t.getMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}
/** Last N month keys ending in the current month. */
function lastNMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

// ─── CSV export ───
function csvCell(v: string | number): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const lines = [headers.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
const money2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// ─── MAIN PAGE ───
export default function ContabilidadPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [nav, setNav] = useState<'panel' | 'transacciones' | 'ventas' | 'informes' | 'config'>('panel');

  // Shared data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [allVouchers, setAllVouchers] = useState<Voucher[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('adminToken');
      const role = sessionStorage.getItem('adminRole');
      if (t) {
        // Contabilidad is admin-only. A vendedora session must not see it.
        if (role === 'vendedora') {
          router.replace('/admin');
          return;
        }
        _adminToken = t;
        setAuthed(true);
      }
    } catch {}
    setReady(true);
  }, [router]);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting?resource=accounts', { headers: adminHeaders() });
      if (!res.ok) { setLoadError(true); return; }
      const d = await res.json();
      setAccounts(d.accounts || []);
    } catch { setLoadError(true); }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting?resource=categories', { headers: adminHeaders() });
      if (!res.ok) { setLoadError(true); return; }
      const d = await res.json();
      setCategories(d.categories || []);
    } catch { setLoadError(true); }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting?resource=orders', { headers: adminHeaders() });
      if (!res.ok) { setLoadError(true); return; }
      const d = await res.json();
      setOrders(d.orders || []);
    } catch { setLoadError(true); }
  }, []);

  // Shared voucher dataset for Panel / Ventas / Informes (Transacciones fetches its own filtered list)
  const loadVouchers = useCallback(async () => {
    try {
      const res = await fetch('/api/accounting?resource=vouchers&sort=asc', { headers: adminHeaders() });
      if (!res.ok) { setLoadError(true); return; }
      const d = await res.json();
      setAllVouchers(d.vouchers || []);
    } catch { setLoadError(true); }
  }, []);

  // Anulados NEVER sum — filtered out once, here.
  const active = useMemo(() => allVouchers.filter(v => v.status === 'activo'), [allVouchers]);

  const reloadAfterMutation = useCallback(() => {
    loadAccounts();
    loadVouchers();
  }, [loadAccounts, loadVouchers]);

  const reloadAll = useCallback(() => {
    setLoadError(false);
    loadAccounts();
    loadCategories();
    loadOrders();
    loadVouchers();
  }, [loadAccounts, loadCategories, loadOrders, loadVouchers]);

  useEffect(() => {
    if (!authed) return;
    reloadAll();
    fetchLogoUrl().then(setLogoUrl).catch(() => {});
  }, [authed, reloadAll]);

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
        const role = data.role || 'admin';
        try {
          sessionStorage.setItem('adminToken', _adminToken);
          sessionStorage.setItem('adminRole', role);
        } catch {}
        // Contabilidad is admin-only: send vendedora to the orders admin.
        if (role === 'vendedora') {
          router.replace('/admin');
          return;
        }
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

      {/* QuickBooks-style nav */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        {([['panel', 'Panel'], ['transacciones', 'Transacciones'], ['ventas', 'Ventas'], ['informes', 'Informes']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setNav(key)}
            className={`whitespace-nowrap px-4 py-2 rounded-lg font-heading font-semibold text-sm transition-all ${
              nav === key ? 'bg-purple text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setNav('config')}
          aria-label="Configuración"
          className={`ml-auto shrink-0 p-2 rounded-lg transition-all ${nav === 'config' ? 'bg-purple text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-700'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-center">
          <p className="font-heading font-bold text-red-600 mb-1">No se pudieron cargar los datos</p>
          <p className="font-body text-sm text-red-500 mb-3">Revisa tu conexión. Si la sesión expiró, vuelve a entrar.</p>
          <button onClick={reloadAll} className="bg-purple text-white font-heading font-bold px-5 py-2 rounded-xl hover:bg-purple-light transition-colors">
            Reintentar
          </button>
        </div>
      )}

      {nav === 'panel' && (
        <PanelView active={active} accounts={accounts} orders={orders} onGoToVentas={() => setNav('ventas')} />
      )}
      {nav === 'transacciones' && (
        <ComprobantesTab
          accounts={accounts}
          categories={categories}
          orders={orders}
          logoUrl={logoUrl}
          onMutated={reloadAfterMutation}
          showToast={showToast}
        />
      )}
      {nav === 'ventas' && (
        <VentasView
          active={active}
          orders={orders}
          accounts={accounts}
          categories={categories}
          onMutated={reloadAfterMutation}
          showToast={showToast}
        />
      )}
      {nav === 'informes' && (
        <InformesView active={active} accounts={accounts} />
      )}
      {nav === 'config' && (
        <ConfigView accounts={accounts} categories={categories} reloadAccounts={loadAccounts} reloadCategories={loadCategories} showToast={showToast} />
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
  const [error, setError] = useState(false);
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
  const [showNewMenu, setShowNewMenu] = useState(false);

  const loadVouchers = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ resource: 'vouchers' });
      if (from) params.set('dateFrom', from);
      if (to) params.set('dateTo', to);
      if (kindFilter) params.set('kind', kindFilter);
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (accountFilter) params.set('accountId', accountFilter);
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/accounting?${params.toString()}`, { headers: adminHeaders() });
      if (!res.ok) { setError(true); return; }
      const d = await res.json();
      setVouchers(d.vouchers || []);
    } catch { setError(true); } finally {
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

  const exportCSV = () => {
    if (vouchers.length === 0) { showToast('No hay comprobantes para exportar'); return; }
    const headers = ['Numero', 'Fecha', 'Tipo', 'Categoria', 'Cuenta', 'Contraparte', 'Descripcion', 'Metodo', 'Referencia', 'Monto', 'Estado'];
    const rows = vouchers.map(v => [
      voucherCode(v), v.date, v.kind, v.category_name || '', v.account_name || '',
      v.counterparty || '', v.description || '', v.payment_method || '', v.reference || '',
      money2(v.amount), v.status,
    ]);
    downloadCSV(`comprobantes_${from || 'inicio'}_${to || 'fin'}.csv`, headers, rows);
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

      {/* Sub-tabs + New dropdown (QuickBooks style) */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 flex-1">
          {([['', 'Todas'], ['ingreso', 'Ingresos'], ['egreso', 'Gastos']] as const).map(([k, label]) => (
            <button
              key={k || 'all'}
              onClick={() => setKindFilter(k)}
              className={`flex-1 py-1.5 rounded-md font-heading font-semibold text-xs transition-all ${kindFilter === k ? 'bg-white text-purple shadow-sm' : 'text-gray-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowNewMenu(s => !s)}
            className="bg-emerald-600 text-white font-heading font-bold py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1"
          >
            <span className="text-base leading-none">+</span> Nuevo <span className="text-[10px]">▾</span>
          </button>
          {showNewMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowNewMenu(false)} />
              <div className="absolute right-0 mt-1 z-20 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden w-36">
                <button onClick={() => { setFormKind('ingreso'); setShowNewMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm font-heading font-semibold text-emerald-700 hover:bg-emerald-50">Ingreso</button>
                <button onClick={() => { setFormKind('egreso'); setShowNewMenu(false); }} className="w-full text-left px-4 py-2.5 text-sm font-heading font-semibold text-red-600 hover:bg-red-50 border-t border-gray-100">Gasto</button>
              </div>
            </>
          )}
        </div>
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
          <div className="grid grid-cols-2 gap-2">
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

      {/* Export */}
      <div className="flex justify-end mb-2">
        <button onClick={exportCSV} className="text-purple font-heading font-semibold text-xs flex items-center gap-1 hover:underline">
          ⬇ Exportar CSV
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="font-heading font-bold text-red-600 mb-1">No se pudieron cargar las transacciones</p>
          <p className="font-body text-sm text-red-500 mb-3">Revisa tu conexión e intenta de nuevo.</p>
          <button onClick={loadVouchers} className="bg-purple text-white font-heading font-bold px-5 py-2 rounded-xl hover:bg-purple-light transition-colors">Reintentar</button>
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
  kind, accounts, categories, orders, onClose, onCreated, showToast, prefill,
}: {
  kind: 'ingreso' | 'egreso';
  accounts: Account[];
  categories: Category[];
  orders: OrderLite[];
  onClose: () => void;
  onCreated: () => void;
  showToast: (m: string) => void;
  prefill?: { orderId?: string; amount?: string; counterparty?: string; description?: string };
}) {
  const [date, setDate] = useState(todayStr());
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [counterparty, setCounterparty] = useState(prefill?.counterparty || '');
  const [description, setDescription] = useState(prefill?.description || '');
  const [amount, setAmount] = useState(prefill?.amount || '');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [orderId, setOrderId] = useState(prefill?.orderId || '');
  const [attachmentPath, setAttachmentPath] = useState('');
  const [attachmentSigned, setAttachmentSigned] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Synchronous double-submit guard — `saving` (state) re-renders too late to block a
  // rapid double-tap, so a ref is the real protection (same pattern as the checkout).
  const savingRef = useRef(false);

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
        headers: { 'x-admin-token': _adminToken },
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
    if (savingRef.current) return;
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) { showToast('El monto debe ser mayor a 0'); return; }
    if (!accountId) { showToast('Selecciona una cuenta'); return; }
    if (!categoryId) { showToast('Selecciona una categoría'); return; }
    savingRef.current = true;
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
      savingRef.current = false;
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
          {v.order_id != null && (
            <Link
              href={`/admin/pedidos/${v.order_id}`}
              className="flex items-center justify-center gap-1.5 w-full text-center bg-purple/10 rounded-lg py-2.5 text-purple font-heading font-semibold text-sm mt-2"
            >
              🧾 Ver pedido vinculado
            </Link>
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
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/accounting?resource=vouchers&accountId=${account.id}&sort=asc`, { headers: adminHeaders() });
      if (!res.ok) { setError(true); return; }
      const d = await res.json();
      setVouchers(d.vouchers || []);
    } catch { setError(true); } finally { setLoading(false); }
  }, [account.id]);

  useEffect(() => { load(); }, [load]);

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
          ) : error ? (
            <div className="text-center py-6">
              <p className="font-body text-sm text-red-500 mb-2">No se pudieron cargar los movimientos.</p>
              <button onClick={load} className="bg-purple text-white font-heading font-bold px-4 py-1.5 rounded-lg text-sm">Reintentar</button>
            </div>
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

// ─── REPORTES TAB ───
function groupSumByCategory(list: Voucher[], kind: 'ingreso' | 'egreso'): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of list) {
    if (v.kind !== kind) continue;
    const key = v.category_name || 'Sin categoría';
    m.set(key, (m.get(key) || 0) + (Number(v.amount) || 0));
  }
  return m;
}
const sumByKind = (list: Voucher[], kind: 'ingreso' | 'egreso') =>
  list.reduce((s, v) => s + (v.kind === kind ? Number(v.amount) || 0 : 0), 0);

// Shared period selector (pills + custom range)
function PeriodPills({ periodKey, setPeriodKey, customFrom, setCustomFrom, customTo, setCustomTo }: {
  periodKey: ReportPeriodKey;
  setPeriodKey: (k: ReportPeriodKey) => void;
  customFrom: string;
  setCustomFrom: (s: string) => void;
  customTo: string;
  setCustomTo: (s: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {REPORT_PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriodKey(p.key)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full font-heading font-semibold text-xs transition-colors ${periodKey === p.key ? 'bg-teal text-purple' : 'bg-gray-100 text-gray-600'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {periodKey === 'custom' && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className={LABEL_CLS}>Desde</label>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>Hasta</label>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={INPUT_CLS} />
          </div>
        </div>
      )}
    </div>
  );
}

// Receivables: ALL non-rejected orders with paid/saldo (saldo>0 means outstanding)
interface Receivable { o: OrderLite; paid: number; saldo: number }
function computeReceivables(active: Voucher[], orders: OrderLite[]): Receivable[] {
  const paid = new Map<number, number>();
  for (const v of active) {
    if (v.kind !== 'ingreso' || v.order_id == null) continue;
    paid.set(v.order_id, (paid.get(v.order_id) || 0) + (Number(v.amount) || 0));
  }
  return orders
    .filter(o => { const st = (o.status || '').toLowerCase(); return st !== 'rechazado' && st !== 'rechazada'; })
    .map(o => {
      const paidAmt = (Number(o.deposit_amount) || 0) + (paid.get(o.id) || 0);
      return { o, paid: paidAmt, saldo: (Number(o.total) || 0) - paidAmt };
    });
}

// ─── PANEL ───
function PanelView({ active, accounts, orders, onGoToVentas }: { active: Voucher[]; accounts: Account[]; orders: OrderLite[]; onGoToVentas: () => void }) {
  const [periodKey, setPeriodKey] = useState<ReportPeriodKey>('mes');
  const [customFrom, setCustomFrom] = useState(reportRange('mes').from);
  const [customTo, setCustomTo] = useState(reportRange('mes').to);
  const { from, to } = periodKey === 'custom' ? { from: customFrom, to: customTo } : reportRange(periodKey);

  const porCobrar = useMemo(() => computeReceivables(active, orders).reduce((s, r) => s + (r.saldo > 0.005 ? r.saldo : 0), 0), [active, orders]);

  return (
    <div>
      <button
        onClick={onGoToVentas}
        className="w-full bg-orange/10 rounded-xl p-4 mb-4 flex items-center justify-between text-left hover:bg-orange/20 transition-colors"
      >
        <div>
          <p className="font-heading text-[11px] text-orange font-semibold uppercase tracking-wide">Por cobrar</p>
          <p className="font-heading font-bold text-orange text-2xl mt-0.5">{formatCurrency(porCobrar)}</p>
        </div>
        <span className="font-heading font-semibold text-orange text-sm whitespace-nowrap">Ver ventas →</span>
      </button>

      <PeriodPills periodKey={periodKey} setPeriodKey={setPeriodKey} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
      <ResumenView active={active} from={from} to={to} accounts={accounts} />
    </div>
  );
}

// ─── VENTAS (QuickBooks-style sales / receivables) ───
function ventaBadge(r: Receivable, today: string): { label: string; cls: string } {
  if (r.saldo <= 0.005) return { label: 'Pagado', cls: 'bg-emerald-100 text-emerald-700' };
  if (r.o.event_date < today) return { label: 'Vencido', cls: 'bg-red-100 text-red-600' };
  if (r.paid > 0.005) return { label: 'Parcial', cls: 'bg-yellow-100 text-yellow-700' };
  return { label: 'Pendiente', cls: 'bg-gray-100 text-gray-500' };
}

function VentasView({ active, orders, accounts, categories, onMutated, showToast }: {
  active: Voucher[];
  orders: OrderLite[];
  accounts: Account[];
  categories: Category[];
  onMutated: () => void;
  showToast: (m: string) => void;
}) {
  const [filter, setFilter] = useState<'todas' | 'pendientes' | 'pagadas'>('todas');
  const [payPrefill, setPayPrefill] = useState<{ orderId: string; amount: string; counterparty: string; description: string } | null>(null);
  const today = todayStr();

  const allRows = useMemo(
    () => computeReceivables(active, orders).sort((a, b) => b.o.event_date.localeCompare(a.o.event_date)),
    [active, orders]
  );
  const porCobrar = allRows.reduce((s, r) => s + (r.saldo > 0.005 ? r.saldo : 0), 0);
  const rows = allRows.filter(r => filter === 'todas' ? true : filter === 'pendientes' ? r.saldo > 0.005 : r.saldo <= 0.005);

  const afterPay = () => { setPayPrefill(null); onMutated(); };

  const exportCSV = () => {
    const headers = ['Pedido', 'Cliente', 'Fecha evento', 'Total', 'Pagado', 'Saldo', 'Estado'];
    const data = rows.map(r => [`#${r.o.order_number}`, r.o.customer_name, r.o.event_date, money2(r.o.total), money2(r.paid), money2(r.saldo), ventaBadge(r, today).label]);
    downloadCSV('ventas.csv', headers, data);
  };

  return (
    <div>
      <div className="bg-orange/10 rounded-xl p-4 mb-4 text-center">
        <p className="font-heading text-[11px] text-orange font-semibold uppercase tracking-wide">Por cobrar</p>
        <p className="font-heading font-bold text-orange text-2xl mt-0.5">{formatCurrency(porCobrar)}</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-3">
        {([['todas', 'Todas'], ['pendientes', 'Pendientes de cobro'], ['pagadas', 'Pagadas']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`flex-1 py-1.5 rounded-md font-heading font-semibold text-[11px] sm:text-xs transition-all ${filter === k ? 'bg-white text-purple shadow-sm' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-4xl mb-2">🧾</p>
          <p className="font-body">No hay ventas en esta vista</p>
        </div>
      ) : (
        <>
        {/* Móvil: tarjetas */}
        <div className="sm:hidden space-y-2 mb-3">
          {rows.map(r => {
            const badge = ventaBadge(r, today);
            return (
              <div key={r.o.id} className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-heading font-semibold text-gray-800 truncate">{r.o.customer_name}</p>
                    <p className="text-[11px] text-gray-400">#{r.o.order_number} · {formatDate(r.o.event_date)}</p>
                  </div>
                  <span className={`inline-block text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div><p className="text-[10px] text-gray-400 uppercase font-heading">Total</p><p className="font-body text-sm text-gray-700">{formatCurrency(Number(r.o.total) || 0)}</p></div>
                  <div><p className="text-[10px] text-gray-400 uppercase font-heading">Pagado</p><p className="font-body text-sm text-emerald-700">{formatCurrency(r.paid)}</p></div>
                  <div><p className="text-[10px] text-gray-400 uppercase font-heading">Saldo</p><p className="font-heading font-bold text-sm text-gray-800">{formatCurrency(Math.max(0, r.saldo))}</p></div>
                </div>
                {r.saldo > 0.005 && (
                  <button
                    onClick={() => setPayPrefill({ orderId: String(r.o.id), amount: r.saldo.toFixed(2), counterparty: r.o.customer_name, description: `Pago pedido #${r.o.order_number}` })}
                    className="w-full mt-3 bg-emerald-600 text-white font-heading font-bold text-sm min-h-[44px] rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    Recibir pago
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {/* Desktop: tabla */}
        <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-hidden mb-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-heading text-[11px] uppercase">
                  <th className="text-left py-2 px-3">Cliente</th>
                  <th className="text-left py-2 px-2">Evento</th>
                  <th className="text-right py-2 px-2">Total</th>
                  <th className="text-right py-2 px-2">Pagado</th>
                  <th className="text-right py-2 px-2">Saldo</th>
                  <th className="text-center py-2 px-2">Estado</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => {
                  const badge = ventaBadge(r, today);
                  return (
                    <tr key={r.o.id} className="font-body">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <p className="font-heading font-semibold text-gray-800 truncate max-w-[120px]">{r.o.customer_name}</p>
                        <p className="text-[10px] text-gray-400">#{r.o.order_number}</p>
                      </td>
                      <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap text-xs">{formatDate(r.o.event_date)}</td>
                      <td className="py-2.5 px-2 text-right text-gray-700 whitespace-nowrap">{formatCurrency(Number(r.o.total) || 0)}</td>
                      <td className="py-2.5 px-2 text-right text-emerald-700 whitespace-nowrap">{formatCurrency(r.paid)}</td>
                      <td className="py-2.5 px-2 text-right font-heading font-bold whitespace-nowrap text-gray-800">{formatCurrency(Math.max(0, r.saldo))}</td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`inline-block text-[10px] font-heading font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {r.saldo > 0.005 && (
                          <button
                            onClick={() => setPayPrefill({ orderId: String(r.o.id), amount: r.saldo.toFixed(2), counterparty: r.o.customer_name, description: `Pago pedido #${r.o.order_number}` })}
                            className="bg-emerald-600 text-white font-heading font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
                          >
                            Recibir pago
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {rows.length > 0 && <ExportButton onClick={exportCSV} />}

      {payPrefill && (
        <VoucherFormModal
          kind="ingreso"
          accounts={accounts.filter(a => a.is_active)}
          categories={categories.filter(c => c.is_active && c.kind === 'ingreso')}
          orders={orders}
          prefill={payPrefill}
          onClose={() => setPayPrefill(null)}
          onCreated={afterPay}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ─── INFORMES (report center) ───
function InformesView({ active, accounts }: { active: Voucher[]; accounts: Account[] }) {
  const [report, setReport] = useState<null | 'pl' | 'flujo'>(null);
  const [periodKey, setPeriodKey] = useState<ReportPeriodKey>('mes');
  const [customFrom, setCustomFrom] = useState(reportRange('mes').from);
  const [customTo, setCustomTo] = useState(reportRange('mes').to);
  const { from, to } = periodKey === 'custom' ? { from: customFrom, to: customTo } : reportRange(periodKey);

  if (!report) {
    const items: { key: 'pl' | 'flujo'; title: string; desc: string; icon: string }[] = [
      { key: 'pl', title: 'Estado de resultados', desc: 'Ingresos, gastos y utilidad neta del período', icon: '📊' },
      { key: 'flujo', title: 'Flujo de efectivo', desc: 'Entradas y salidas de dinero por mes', icon: '💵' },
    ];
    return (
      <div className="space-y-2">
        <p className="font-heading font-bold text-sm text-gray-500 uppercase tracking-wide mb-1">Informes</p>
        {items.map(it => (
          <button
            key={it.key}
            onClick={() => setReport(it.key)}
            className="w-full bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 text-left hover:shadow-sm hover:border-purple/40 transition-all"
          >
            <span className="text-2xl">{it.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-heading font-bold text-gray-800">{it.title}</p>
              <p className="text-xs text-gray-400 font-body">{it.desc}</p>
            </div>
            <span className="text-gray-300 text-xl">›</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setReport(null)} className="flex items-center gap-1 text-purple font-heading font-semibold text-sm mb-3">
        ← Informes
      </button>
      <h2 className="font-heading font-bold text-xl text-purple mb-3">{report === 'pl' ? 'Estado de resultados' : 'Flujo de efectivo'}</h2>
      <PeriodPills periodKey={periodKey} setPeriodKey={setPeriodKey} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
      {report === 'pl' ? <PLView active={active} from={from} to={to} periodKey={periodKey} /> : <FlujoView active={active} from={from} to={to} accounts={accounts} />}
    </div>
  );
}

// ─── CONFIGURACIÓN ───
function ConfigView({ accounts, categories, reloadAccounts, reloadCategories, showToast }: {
  accounts: Account[];
  categories: Category[];
  reloadAccounts: () => void;
  reloadCategories: () => void;
  showToast: (m: string) => void;
}) {
  const [sub, setSub] = useState<'cuentas' | 'categorias'>('cuentas');
  return (
    <div>
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-5">
        {([['cuentas', 'Cuentas'], ['categorias', 'Categorías']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={`flex-1 py-1.5 rounded-md font-heading font-semibold text-xs transition-all ${sub === k ? 'bg-white text-purple shadow-sm' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === 'cuentas'
        ? <CuentasTab accounts={accounts} reload={reloadAccounts} showToast={showToast} />
        : <CategoriasTab categories={categories} reload={reloadCategories} showToast={showToast} />}
    </div>
  );
}

// ── Resumen ──
function ResumenView({ active, from, to, accounts }: { active: Voucher[]; from: string; to: string; accounts: Account[] }) {
  const periodV = useMemo(() => active.filter(v => inRange(v.date, from, to)), [active, from, to]);
  const ingresos = sumByKind(periodV, 'ingreso');
  const gastos = sumByKind(periodV, 'egreso');
  const utilidad = ingresos - gastos;
  const saldoTotal = accounts.reduce((s, a) => s + (a.balance ?? a.initial_balance ?? 0), 0);

  const monthly = useMemo(() => {
    return lastNMonths(6).map(mk => {
      const list = active.filter(v => monthKey(v.date) === mk);
      return { mes: monthLabel(mk), Ingresos: money2(sumByKind(list, 'ingreso')), Gastos: money2(sumByKind(list, 'egreso')) };
    });
  }, [active]);

  const topGastos = useMemo(() => {
    const m = groupSumByCategory(periodV, 'egreso');
    return [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [periodV]);
  const maxTop = topGastos.length ? topGastos[0].amount : 0;

  const exportCSV = () => {
    const headers = ['Mes', 'Ingresos', 'Gastos', 'Utilidad'];
    const rows = monthly.map(r => [r.mes, r.Ingresos, r.Gastos, money2(r.Ingresos - r.Gastos)]);
    downloadCSV(`resumen_${from}_${to}.csv`, headers, rows);
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Card label="Ingresos" value={ingresos} color="emerald" />
        <Card label="Gastos" value={gastos} color="red" />
        <Card label="Utilidad" value={utilidad} color={utilidad >= 0 ? 'emerald' : 'red'} />
        <Card label="Saldo en cuentas" value={saldoTotal} color="purple" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4">
        <p className="font-heading font-bold text-sm text-gray-700 mb-2">Ingresos vs Gastos (últimos 6 meses)</p>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Ingresos" fill="#059669" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-3">
        <p className="font-heading font-bold text-sm text-gray-700 mb-2">Top 5 categorías de gasto</p>
        {topGastos.length === 0 ? (
          <p className="text-gray-400 text-sm font-body py-2">Sin gastos en el período</p>
        ) : (
          <div className="space-y-2">
            {topGastos.map(c => (
              <div key={c.name}>
                <div className="flex justify-between text-sm mb-0.5">
                  <span className="font-body text-gray-700 truncate pr-2">{c.name}</span>
                  <span className="font-heading font-bold text-red-600 whitespace-nowrap">{formatCurrency(c.amount)}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${maxTop ? (c.amount / maxTop) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ExportButton onClick={exportCSV} />
    </div>
  );
}

// ── Estado de resultados (P&L) ──
function PLView({ active, from, to, periodKey }: { active: Voucher[]; from: string; to: string; periodKey: ReportPeriodKey }) {
  const [compare, setCompare] = useState(false);
  const prev = useMemo(() => previousReportRange(periodKey, from, to), [periodKey, from, to]);

  const cur = useMemo(() => active.filter(v => inRange(v.date, from, to)), [active, from, to]);
  const prevV = useMemo(() => active.filter(v => inRange(v.date, prev.from, prev.to)), [active, prev]);

  const ingCur = useMemo(() => groupSumByCategory(cur, 'ingreso'), [cur]);
  const gasCur = useMemo(() => groupSumByCategory(cur, 'egreso'), [cur]);
  const ingPrev = useMemo(() => groupSumByCategory(prevV, 'ingreso'), [prevV]);
  const gasPrev = useMemo(() => groupSumByCategory(prevV, 'egreso'), [prevV]);

  const subIngCur = sumByKind(cur, 'ingreso'), subGasCur = sumByKind(cur, 'egreso');
  const subIngPrev = sumByKind(prevV, 'ingreso'), subGasPrev = sumByKind(prevV, 'egreso');
  const netCur = subIngCur - subGasCur, netPrev = subIngPrev - subGasPrev;

  const catList = (curMap: Map<string, number>, prevMap: Map<string, number>) => {
    const names = new Set([...curMap.keys(), ...prevMap.keys()]);
    return [...names].map(n => ({ name: n, cur: curMap.get(n) || 0, prev: prevMap.get(n) || 0 })).sort((a, b) => b.cur - a.cur);
  };
  const variation = (c: number, p: number): string => {
    if (p === 0) return c === 0 ? '—' : '+100%';
    const pct = ((c - p) / Math.abs(p)) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
  };

  const exportCSV = () => {
    const headers = compare ? ['Seccion', 'Categoria', 'Monto', 'Anterior', 'Variacion'] : ['Seccion', 'Categoria', 'Monto'];
    const rows: (string | number)[][] = [];
    for (const r of catList(ingCur, ingPrev)) rows.push(compare ? ['Ingresos', r.name, money2(r.cur), money2(r.prev), variation(r.cur, r.prev)] : ['Ingresos', r.name, money2(r.cur)]);
    rows.push(compare ? ['Ingresos', 'TOTAL', money2(subIngCur), money2(subIngPrev), variation(subIngCur, subIngPrev)] : ['Ingresos', 'TOTAL', money2(subIngCur)]);
    for (const r of catList(gasCur, gasPrev)) rows.push(compare ? ['Gastos', r.name, money2(r.cur), money2(r.prev), variation(r.cur, r.prev)] : ['Gastos', r.name, money2(r.cur)]);
    rows.push(compare ? ['Gastos', 'TOTAL', money2(subGasCur), money2(subGasPrev), variation(subGasCur, subGasPrev)] : ['Gastos', 'TOTAL', money2(subGasCur)]);
    rows.push(compare ? ['', 'UTILIDAD NETA', money2(netCur), money2(netPrev), variation(netCur, netPrev)] : ['', 'UTILIDAD NETA', money2(netCur)]);
    downloadCSV(`estado_resultados_${from}_${to}.csv`, headers, rows);
  };

  const Row = ({ name, cur: c, prev: p, bold }: { name: string; cur: number; prev: number; bold?: boolean }) => (
    <div className={`flex items-center py-1.5 text-sm ${bold ? 'font-heading font-bold border-t border-gray-200 mt-1 pt-2' : 'font-body'}`}>
      <span className={`flex-1 truncate pr-2 ${bold ? 'text-gray-800' : 'text-gray-600'}`}>{name}</span>
      <span className="w-24 text-right text-gray-800">{formatCurrency(c)}</span>
      {compare && <span className="w-20 text-right text-gray-400 text-xs">{formatCurrency(p)}</span>}
      {compare && <span className={`w-14 text-right text-xs font-semibold ${c - p >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{variation(c, p)}</span>}
    </div>
  );

  return (
    <div>
      <label className="flex items-center gap-2 mb-3 text-sm font-body text-gray-600">
        <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-purple w-4 h-4" />
        Comparar vs período anterior
      </label>

      {compare && (
        <p className="text-[11px] text-gray-400 font-body mb-2">Anterior: {formatDate(prev.from)} – {formatDate(prev.to)}</p>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
        <h3 className="font-heading font-bold text-sm uppercase tracking-wide text-emerald-700 mb-1">Ingresos</h3>
        {catList(ingCur, ingPrev).length === 0 ? <p className="text-gray-400 text-sm font-body py-1">Sin ingresos</p> :
          catList(ingCur, ingPrev).map(r => <Row key={r.name} name={r.name} cur={r.cur} prev={r.prev} />)}
        <Row name="Subtotal ingresos" cur={subIngCur} prev={subIngPrev} bold />

        <h3 className="font-heading font-bold text-sm uppercase tracking-wide text-red-600 mb-1 mt-4">Gastos</h3>
        {catList(gasCur, gasPrev).length === 0 ? <p className="text-gray-400 text-sm font-body py-1">Sin gastos</p> :
          catList(gasCur, gasPrev).map(r => <Row key={r.name} name={r.name} cur={r.cur} prev={r.prev} />)}
        <Row name="Subtotal gastos" cur={subGasCur} prev={subGasPrev} bold />

        <div className={`flex items-center py-2 mt-3 border-t-2 ${netCur >= 0 ? 'border-emerald-500' : 'border-red-500'}`}>
          <span className="flex-1 font-heading font-bold text-gray-800">Utilidad neta</span>
          <span className={`w-24 text-right font-heading font-bold ${netCur >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatCurrency(netCur)}</span>
          {compare && <span className="w-20 text-right text-gray-400 text-xs">{formatCurrency(netPrev)}</span>}
          {compare && <span className={`w-14 text-right text-xs font-semibold ${netCur - netPrev >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{variation(netCur, netPrev)}</span>}
        </div>
      </div>

      <ExportButton onClick={exportCSV} />
    </div>
  );
}

// ── Flujo de efectivo ──
function FlujoView({ active, from, to, accounts }: { active: Voucher[]; from: string; to: string; accounts: Account[] }) {
  const [accountId, setAccountId] = useState('');

  const scoped = useMemo(() => accountId ? active.filter(v => v.account_id === accountId) : active, [active, accountId]);
  const baseInitial = useMemo(() => {
    if (accountId) {
      const a = accounts.find(x => x.id === accountId);
      return Number(a?.initial_balance) || 0;
    }
    return accounts.reduce((s, a) => s + (Number(a.initial_balance) || 0), 0);
  }, [accountId, accounts]);

  const rows = useMemo(() => {
    const opening = baseInitial + scoped.filter(v => v.date < from).reduce((s, v) => s + (v.kind === 'ingreso' ? Number(v.amount) : -Number(v.amount)), 0);
    let running = opening;
    return monthsInRange(from, to).map(mk => {
      const list = scoped.filter(v => monthKey(v.date) === mk && inRange(v.date, from, to));
      const entradas = sumByKind(list, 'ingreso');
      const salidas = sumByKind(list, 'egreso');
      const saldoInicial = running;
      const saldoFinal = saldoInicial + entradas - salidas;
      running = saldoFinal;
      return { mes: monthLabel(mk), saldoInicial, entradas, salidas, saldoFinal };
    });
  }, [scoped, baseInitial, from, to]);

  const exportCSV = () => {
    const headers = ['Mes', 'Saldo inicial', 'Entradas', 'Salidas', 'Saldo final'];
    const data = rows.map(r => [r.mes, money2(r.saldoInicial), money2(r.entradas), money2(r.salidas), money2(r.saldoFinal)]);
    downloadCSV(`flujo_efectivo_${from}_${to}.csv`, headers, data);
  };

  return (
    <div>
      <div className="mb-3">
        <label className={LABEL_CLS}>Cuenta</label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={INPUT_CLS}>
          <option value="">Consolidado (todas)</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 font-heading text-[11px] uppercase">
                <th className="text-left py-2 px-3">Mes</th>
                <th className="text-right py-2 px-2">S. inicial</th>
                <th className="text-right py-2 px-2">Entradas</th>
                <th className="text-right py-2 px-2">Salidas</th>
                <th className="text-right py-2 px-3">S. final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-6 font-body">Sin datos en el período</td></tr>
              ) : rows.map(r => (
                <tr key={r.mes} className="font-body">
                  <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{r.mes}</td>
                  <td className="py-2 px-2 text-right text-gray-500 whitespace-nowrap">{formatCurrency(r.saldoInicial)}</td>
                  <td className="py-2 px-2 text-right text-emerald-700 whitespace-nowrap">{formatCurrency(r.entradas)}</td>
                  <td className="py-2 px-2 text-right text-red-600 whitespace-nowrap">{formatCurrency(r.salidas)}</td>
                  <td className="py-2 px-3 text-right font-heading font-bold text-gray-800 whitespace-nowrap">{formatCurrency(r.saldoFinal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ExportButton onClick={exportCSV} />
    </div>
  );
}

// ── Shared report bits ──
function Card({ label, value, color }: { label: string; value: number; color: 'emerald' | 'red' | 'purple' }) {
  const cls = color === 'emerald'
    ? 'bg-emerald-50 text-emerald-700'
    : color === 'red'
    ? 'bg-red-50 text-red-600'
    : 'bg-purple/10 text-purple';
  return (
    <div className={`rounded-xl p-4 ${cls}`}>
      <p className="font-heading text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="font-heading font-bold text-xl mt-1">{formatCurrency(value)}</p>
    </div>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-600 font-heading font-semibold text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5">
      ⬇ Exportar CSV
    </button>
  );
}
