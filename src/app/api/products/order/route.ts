import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireRole } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, 'admin');
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const { ids } = await request.json();
    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 });
    }
    // A Supabase query builder RESOLVES with { error } on a DB failure — it does
    // not reject — so Promise.allSettled always reports "fulfilled" and hid every
    // failure. Inspect each response's .error instead.
    const results = await Promise.all(
      ids.map((id: string, i: number) =>
        supabaseAdmin!.from('pt_products').update({ sort_order: i }).eq('id', id)
      )
    );
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      console.error('Product order update errors:', failed.map((r) => r.error));
      return NextResponse.json({ error: 'Some updates failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Product order API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
