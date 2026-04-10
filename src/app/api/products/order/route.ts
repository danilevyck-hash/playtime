import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidSession } from '@/lib/admin-auth';

function isAuthorized(request: NextRequest): boolean {
  const token = request.headers.get('x-admin-token');
  if (isValidSession(token)) return true;
  const pin = request.headers.get('x-admin-pin');
  return pin === process.env.ADMIN_PIN;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const { ids } = await request.json();
    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 });
    }
    const updates = ids.map((id: string, i: number) =>
      supabaseAdmin!.from('pt_products').update({ sort_order: i }).eq('id', id)
    );
    const results = await Promise.allSettled(updates);
    const allOk = results.every(r => r.status === 'fulfilled');
    if (!allOk) {
      return NextResponse.json({ error: 'Some updates failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Product order API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
