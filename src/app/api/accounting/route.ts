export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/admin-auth';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const VOUCHER_KINDS = ['ingreso', 'egreso'];
const CATEGORY_KINDS = ['ingreso', 'gasto'];

/** Sanitize a free-text search term for use inside Supabase ilike .or() expression */
function sanitizeSearch(q: string): string {
  return q.replace(/[,%()*]/g, '').trim().slice(0, 80);
}

/** Fetch ALL rows across Supabase's 1000-row page cap via .range() paging. Throws on
 *  error (no silent truncation). makePage must build a FRESH query each call. */
async function fetchAllPaged<T>(
  makePage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await makePage(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

// ─── GET ───
// resource=bootstrap → accounts + categories + orders (for form selects)
// resource=accounts  → accounts with computed balances
// resource=categories→ categories
// resource=vouchers  → filtered list enriched with account/category names
// resource=orders    → minimal orders list for linking
export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, 'admin');
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const db = supabaseAdmin || supabase;
    if (!db) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const url = new URL(request.url);
    const resource = url.searchParams.get('resource') || 'vouchers';

    if (resource === 'attachment') {
      const path = url.searchParams.get('path') || '';
      // Stored paths are flat filenames we generate; reject traversal / empties
      if (!path || path.includes('..') || path.startsWith('/')) {
        return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 });
      }
      if (!supabaseAdmin) {
        return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
      }
      const { data: signed, error } = await supabaseAdmin.storage
        .from('vouchers')
        .createSignedUrl(path, 60 * 60); // 1 hour
      if (error || !signed?.signedUrl) {
        console.error('Signed URL error:', error);
        return NextResponse.json({ error: 'No se pudo generar el enlace' }, { status: 500 });
      }
      return NextResponse.json({ url: signed.signedUrl });
    }

    if (resource === 'orders') {
      const { data, error } = await db
        .from('pt_orders')
        .select('id, order_number, customer_name, event_date, total, deposit_amount, status')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) {
        console.error('Accounting orders fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
      }
      return NextResponse.json({ orders: data || [] });
    }

    if (resource === 'categories') {
      const { data, error } = await db
        .from('pt_categories')
        .select('*')
        .order('name', { ascending: true });
      if (error) {
        console.error('Categories fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
      }
      return NextResponse.json({ categories: data || [] });
    }

    // Load accounts + categories (used by several resources)
    const [{ data: accounts }, { data: categories }] = await Promise.all([
      db.from('pt_accounts').select('*').order('created_at', { ascending: true }),
      db.from('pt_categories').select('*').order('name', { ascending: true }),
    ]);

    if (resource === 'bootstrap') {
      const { data: orders } = await db
        .from('pt_orders')
        .select('id, order_number, customer_name, event_date, total, deposit_amount, status')
        .order('created_at', { ascending: false })
        .limit(300);
      return NextResponse.json({
        accounts: accounts || [],
        categories: categories || [],
        orders: orders || [],
      });
    }

    if (resource === 'accounts') {
      // Compute balances from ALL active vouchers (paged — no 1000-row silent cap).
      let vouchers: { account_id: string | null; kind: string; amount: number }[];
      try {
        vouchers = await fetchAllPaged((from, to) =>
          db.from('pt_vouchers').select('account_id, kind, amount, status').eq('status', 'activo').range(from, to),
        );
      } catch (e) {
        console.error('accounts balance fetch error:', e);
        return NextResponse.json({ error: 'No se pudieron calcular los saldos' }, { status: 500 });
      }
      const deltas: Record<string, number> = {};
      for (const v of vouchers || []) {
        if (!v.account_id) continue;
        const amt = Number(v.amount) || 0;
        deltas[v.account_id] = (deltas[v.account_id] || 0) + (v.kind === 'ingreso' ? amt : -amt);
      }
      const withBalances = (accounts || []).map((a: { id: string; initial_balance: number }) => ({
        ...a,
        balance: round2((Number(a.initial_balance) || 0) + (deltas[a.id] || 0)),
      }));
      return NextResponse.json({ accounts: withBalances });
    }

    // resource === 'vouchers'
    const accountMap: Record<string, string> = {};
    for (const a of accounts || []) accountMap[a.id] = a.name;
    const categoryMap: Record<string, string> = {};
    for (const c of categories || []) categoryMap[c.id] = c.name;

    const sortAsc = url.searchParams.get('sort') === 'asc';
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const kind = url.searchParams.get('kind');
    const categoryId = url.searchParams.get('categoryId');
    const accountId = url.searchParams.get('accountId');
    const q = url.searchParams.get('q');
    const term = q ? sanitizeSearch(q) : '';

    // Build a FRESH filtered query per page so .range() paging fetches ALL matches
    // (no silent 1000-row cap).
    const buildVoucherQuery = () => {
      let qy = db.from('pt_vouchers').select('*')
        .order('date', { ascending: sortAsc })
        .order('voucher_number', { ascending: sortAsc });
      if (dateFrom) qy = qy.gte('date', dateFrom);
      if (dateTo) qy = qy.lte('date', dateTo);
      if (kind && VOUCHER_KINDS.includes(kind)) qy = qy.eq('kind', kind);
      if (categoryId) qy = qy.eq('category_id', categoryId);
      if (accountId) qy = qy.eq('account_id', accountId);
      if (term) qy = qy.or(`counterparty.ilike.%${term}%,description.ilike.%${term}%,reference.ilike.%${term}%`);
      return qy;
    };

    let vouchers: { account_id: string | null; category_id: string | null }[];
    try {
      vouchers = await fetchAllPaged((from, to) => buildVoucherQuery().range(from, to));
    } catch (error) {
      console.error('Vouchers fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch vouchers' }, { status: 500 });
    }

    const enriched = (vouchers || []).map((v: { account_id: string | null; category_id: string | null }) => ({
      ...v,
      account_name: v.account_id ? accountMap[v.account_id] || null : null,
      category_name: v.category_id ? categoryMap[v.category_id] || null : null,
    }));

    return NextResponse.json({ vouchers: enriched });
  } catch (error) {
    console.error('Accounting GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ─── create voucher / account / category
export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, 'admin');
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const db = supabaseAdmin || supabase;
    if (!db) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const body = await request.json();
    const resource = body.resource;

    if (resource === 'account') {
      const name = String(body.name || '').trim();
      if (!name || name.length > 100) {
        return NextResponse.json({ error: 'Nombre de cuenta requerido (máx 100)' }, { status: 400 });
      }
      const type = String(body.type || 'banco').trim() || 'banco';
      const initial = Number(body.initial_balance);
      const { data, error } = await db
        .from('pt_accounts')
        .insert({
          name,
          type,
          initial_balance: isNaN(initial) ? 0 : initial,
          is_active: true,
        })
        .select('*')
        .single();
      if (error) {
        console.error('Account insert error:', error);
        return NextResponse.json({ error: 'Error al crear cuenta' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, account: data });
    }

    if (resource === 'category') {
      const name = String(body.name || '').trim();
      if (!name || name.length > 100) {
        return NextResponse.json({ error: 'Nombre de categoría requerido (máx 100)' }, { status: 400 });
      }
      const kind = String(body.kind || '');
      if (!CATEGORY_KINDS.includes(kind)) {
        return NextResponse.json({ error: "Tipo debe ser 'ingreso' o 'gasto'" }, { status: 400 });
      }
      const { data, error } = await db
        .from('pt_categories')
        .insert({ name, kind, is_active: true })
        .select('*')
        .single();
      if (error) {
        console.error('Category insert error:', error);
        return NextResponse.json({ error: 'Error al crear categoría' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, category: data });
    }

    // resource === 'voucher'
    const kind = String(body.kind || '');
    if (!VOUCHER_KINDS.includes(kind)) {
      return NextResponse.json({ error: "Tipo debe ser 'ingreso' o 'egreso'" }, { status: 400 });
    }
    const amount = Number(body.amount);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 });
    }
    if (amount > 9999999) {
      return NextResponse.json({ error: 'Monto demasiado grande' }, { status: 400 });
    }
    if (!body.account_id || typeof body.account_id !== 'string') {
      return NextResponse.json({ error: 'Cuenta requerida' }, { status: 400 });
    }
    if (!body.category_id || typeof body.category_id !== 'string') {
      return NextResponse.json({ error: 'Categoría requerida' }, { status: 400 });
    }
    let date = String(body.date || '').trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD)' }, { status: 400 });
    }
    if (!date) {
      const nowPanama = new Date(Date.now() - 5 * 60 * 60 * 1000);
      date = nowPanama.toISOString().slice(0, 10);
    }

    const orderId = body.order_id != null && body.order_id !== '' ? Number(body.order_id) : null;
    if (orderId != null && (isNaN(orderId) || orderId < 0)) {
      return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
    }

    // Idempotency backstop (no schema change): if an identical active voucher was
    // created in the last ~10s, return it instead of inserting a duplicate. Catches a
    // double-tap that slips past the client-side ref guard. Not a hard guarantee
    // (true-concurrent inserts could still both pass) — a UNIQUE index would need a migration.
    const recentIso = new Date(Date.now() - 10_000).toISOString();
    let dupQuery = db.from('pt_vouchers')
      .select('*')
      .eq('kind', kind)
      .eq('account_id', body.account_id)
      .eq('category_id', body.category_id)
      .eq('amount', round2(amount))
      .eq('status', 'activo')
      .gte('created_at', recentIso)
      .order('created_at', { ascending: false })
      .limit(1);
    dupQuery = orderId == null ? dupQuery.is('order_id', null) : dupQuery.eq('order_id', orderId);
    const { data: recentDup } = await dupQuery;
    if (recentDup && recentDup.length > 0) {
      return NextResponse.json({ ok: true, voucher: recentDup[0], deduped: true });
    }

    const insertRow = {
      kind,
      date,
      account_id: body.account_id,
      category_id: body.category_id,
      order_id: orderId,
      counterparty: body.counterparty ? String(body.counterparty).slice(0, 200) : null,
      description: body.description ? String(body.description).slice(0, 500) : null,
      amount: round2(amount),
      payment_method: body.payment_method ? String(body.payment_method).slice(0, 60) : null,
      reference: body.reference ? String(body.reference).slice(0, 120) : null,
      attachment_url: body.attachment_url ? String(body.attachment_url).slice(0, 500) : null,
      status: 'activo',
      notes: body.notes ? String(body.notes).slice(0, 1000) : null,
    };

    const { data, error } = await db
      .from('pt_vouchers')
      .insert(insertRow)
      .select('*')
      .single();
    if (error) {
      console.error('Voucher insert error:', error);
      return NextResponse.json({ error: 'Error al guardar comprobante' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, voucher: data });
  } catch (error) {
    console.error('Accounting POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PATCH ─── void voucher / update account / update category
export async function PATCH(request: NextRequest) {
  try {
    const auth = requireRole(request, 'admin');
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const db = supabaseAdmin || supabase;
    if (!db) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const body = await request.json();
    const resource = body.resource;

    if (resource === 'voucher_void') {
      if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
      const { error } = await db
        .from('pt_vouchers')
        .update({ status: 'anulado' })
        .eq('id', body.id);
      if (error) {
        console.error('Voucher void error:', error);
        return NextResponse.json({ error: 'Error al anular comprobante' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (resource === 'account') {
      if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name || name.length > 100) return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 });
        updates.name = name;
      }
      if (body.type !== undefined) updates.type = String(body.type).slice(0, 40) || 'banco';
      if (body.is_active !== undefined) updates.is_active = !!body.is_active;
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
      }
      const { error } = await db.from('pt_accounts').update(updates).eq('id', body.id);
      if (error) {
        console.error('Account update error:', error);
        return NextResponse.json({ error: 'Error al actualizar cuenta' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (resource === 'category') {
      if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name || name.length > 100) return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 });
        updates.name = name;
      }
      if (body.is_active !== undefined) updates.is_active = !!body.is_active;
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
      }
      const { error } = await db.from('pt_categories').update(updates).eq('id', body.id);
      if (error) {
        console.error('Category update error:', error);
        return NextResponse.json({ error: 'Error al actualizar categoría' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Recurso no especificado' }, { status: 400 });
  } catch (error) {
    console.error('Accounting PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
