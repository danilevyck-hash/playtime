export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
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

    const { key, value } = await request.json();

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key requerido' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('pt_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
      console.error(`upsertSetting API (${key}) error:`, error);
      return NextResponse.json({ error: 'Failed to upsert setting' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
