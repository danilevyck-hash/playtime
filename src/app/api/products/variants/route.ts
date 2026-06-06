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
    const variant = await request.json();
    const { error } = await supabaseAdmin
      .from('pt_product_variants')
      .upsert(variant, { onConflict: 'product_id,id' });
    if (error) {
      console.error('upsertDBVariant API error:', error);
      return NextResponse.json({ error: 'Failed to upsert variant' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Variants API error:', error);
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
    const { productId, variantId } = await request.json();
    if (!productId || !variantId) {
      return NextResponse.json({ error: 'productId and variantId required' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from('pt_product_variants')
      .delete()
      .eq('product_id', productId)
      .eq('id', variantId);
    if (error) {
      console.error('deleteDBVariant API error:', error);
      return NextResponse.json({ error: 'Failed to delete variant' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Variants API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
