export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { isValidSession } from '@/lib/admin-auth';

function isAdminAuthorized(request: NextRequest): boolean {
  const token = request.headers.get('x-admin-token');
  if (isValidSession(token)) return true;
  const pin = request.headers.get('x-admin-pin');
  return pin === process.env.ADMIN_PIN;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!isAdminAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = supabaseAdmin || supabase;
    if (!db) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const id = Number(params.id);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const { data: orderData, error: orderErr } = await db
      .from('pt_orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (orderErr) {
      console.error('Order fetch error:', orderErr);
      return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
    }
    if (!orderData) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { data: items } = await db
      .from('pt_order_items')
      .select('*')
      .eq('order_id', id)
      .order('id', { ascending: true });

    return NextResponse.json({ order: { ...orderData, items: items || [] } });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
