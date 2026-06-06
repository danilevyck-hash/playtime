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
    const product = await request.json();
    const { id, ...fields } = product;

    let error;
    if (id) {
      // Check if product exists
      const { data: existing } = await supabaseAdmin
        .from('pt_products')
        .select('id')
        .eq('id', id)
        .limit(1);

      if (existing && existing.length > 0) {
        // UPDATE existing product (partial fields OK)
        ({ error } = await supabaseAdmin
          .from('pt_products')
          .update(fields)
          .eq('id', id));
      } else {
        // INSERT new product (needs all fields)
        ({ error } = await supabaseAdmin
          .from('pt_products')
          .insert({ id, ...fields }));
      }
    } else {
      ({ error } = await supabaseAdmin
        .from('pt_products')
        .insert(fields));
    }

    if (error) {
      console.error('upsertDBProduct API error:', error);
      return NextResponse.json({ error: 'Failed to upsert product: ' + error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Products API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = requireRole(request, 'admin');
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const { id } = await request.json();
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Product id required' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from('pt_products')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('deleteDBProduct API error:', error);
      return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Products API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
