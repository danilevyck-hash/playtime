export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { isValidSession } from '@/lib/admin-auth';

type OrderRow = { status: string | null; confirmed: boolean | null; total: number | null; event_date: string | null };

/** Canonical status — mirrors getOrderStatus() in the admin client. */
function canonicalStatus(o: OrderRow): 'pendiente' | 'confirmado' | 'realizado' | 'rechazado' {
  const s = o.status;
  if (s === 'realizado') return 'realizado';
  if (s === 'rechazado' || s === 'rechazada') return 'rechazado';
  if (s === 'confirmado' || s === 'aprobada' || s === 'deposito') return 'confirmado';
  if (s === 'pendiente' || s === 'nuevo') return 'pendiente';
  if (o.confirmed) return 'confirmado';
  return 'pendiente';
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// GET /api/orders/stats — server-side aggregation over ALL orders (counts per status,
// confirmed revenue, available event months). Pagination of the list makes the old
// in-memory stats a lie; this is the source of truth.
export async function GET(request: NextRequest) {
  try {
    if (!isValidSession(request.headers.get('x-admin-token'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = supabaseAdmin || supabase;
    if (!db) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Page through ALL orders (minimal cols) — no 1000-row silent cap.
    const PAGE = 1000;
    const rows: OrderRow[] = [];
    for (let from = 0; from < 500000; from += PAGE) {
      const { data, error } = await db
        .from('pt_orders')
        .select('status, confirmed, total, event_date')
        .range(from, from + PAGE - 1);
      if (error) {
        console.error('Stats fetch error:', error);
        return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      rows.push(...(data as OrderRow[]));
      if (data.length < PAGE) break;
    }

    const counts = { pendiente: 0, confirmado: 0, realizado: 0, rechazado: 0 };
    let confirmedRevenue = 0;
    const monthSet = new Set<string>();
    for (const o of rows) {
      counts[canonicalStatus(o)]++;
      if (o.confirmed) confirmedRevenue += Number(o.total) || 0;
      if (o.event_date) monthSet.add(o.event_date.substring(0, 7));
    }

    const todayKey = new Date().toISOString().substring(0, 7);
    const months = Array.from(monthSet)
      .sort((a, b) => {
        const aF = a >= todayKey, bF = b >= todayKey;
        if (aF && !bF) return -1;
        if (!aF && bF) return 1;
        return aF ? a.localeCompare(b) : b.localeCompare(a);
      })
      .map((m) => {
        const [y, mm] = m.split('-');
        return { key: m, label: `${MESES[Number(mm) - 1]} ${y}` };
      });

    return NextResponse.json({
      total: rows.length,
      counts,
      confirmedRevenue: Math.round(confirmedRevenue * 100) / 100,
      months,
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
