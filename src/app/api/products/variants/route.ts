import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidSession } from '@/lib/admin-auth';

function isAuthorized(request: NextRequest): boolean {
  // 1. Check HMAC-signed token (works across serverless cold starts)
  const token = request.headers.get('x-admin-token');
  if (isValidSession(token)) return true;
  // 2. Check PIN (for PIN-based login)
  const pin = request.headers.get('x-admin-pin');
  if (pin && pin === process.env.ADMIN_PIN) return true;
  if (pin && pin === process.env.VENDEDORA_PIN) return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
