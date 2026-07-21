export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidSession } from '@/lib/admin-auth';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
};

function isAdminAuthorized(request: NextRequest): boolean {
  // Token-only — the raw x-admin-pin header fallback was removed.
  return isValidSession(request.headers.get('x-admin-token'));
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isAdminAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_CACHE_HEADERS });
    }
    const db = supabaseAdmin;
    if (!db) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500, headers: NO_CACHE_HEADERS });
    }
    const id = Number(params.id);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const { data: orderData, error: orderErr } = await db
      .from('pt_orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (orderErr) {
      console.error('Order fetch error:', orderErr);
      return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500, headers: NO_CACHE_HEADERS });
    }
    if (!orderData) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404, headers: NO_CACHE_HEADERS });
    }

    const { data: items, error: itemsErr } = await db
      .from('pt_order_items')
      .select('*')
      .eq('order_id', id)
      .order('id', { ascending: true });

    if (itemsErr) {
      console.error('Order items fetch error:', itemsErr);
      return NextResponse.json({ error: 'No se pudieron cargar los ítems del pedido' }, { status: 500, headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json(
      { order: { ...orderData, items: items || [] } },
      { headers: NO_CACHE_HEADERS },
    );
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
