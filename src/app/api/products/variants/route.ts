import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireRole } from '@/lib/admin-auth';

// Column allowlist for pt_product_variants (no raw upsert of arbitrary columns).
function sanitizeVariant(input: unknown): { variant: Record<string, unknown> } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'Variante inválida' };
  const v = input as Record<string, unknown>;
  if (typeof v.product_id !== 'string' || !v.product_id) return { error: 'product_id requerido' };
  if (typeof v.id !== 'string' || !v.id) return { error: 'id de variante requerido' };
  if (typeof v.label !== 'string' || v.label.trim().length === 0 || v.label.length > 200) return { error: 'Label inválido (máx 200)' };
  const out: Record<string, unknown> = { product_id: v.product_id, id: v.id, label: v.label.trim() };
  if (v.price === undefined || v.price === null) {
    out.price = null;
  } else {
    const price = Number(v.price);
    if (!Number.isFinite(price) || price < 0) return { error: 'Precio inválido (>= 0)' };
    out.price = price;
  }
  if (v.image_url !== undefined) {
    if (v.image_url === null) out.image_url = null;
    else if (typeof v.image_url === 'string' && v.image_url.length <= 500) out.image_url = v.image_url;
    else return { error: 'image_url inválido' };
  }
  if (v.description !== undefined) {
    if (v.description === null) out.description = null;
    else if (typeof v.description === 'string' && v.description.length <= 2000) out.description = v.description;
    else return { error: 'description inválido' };
  }
  if (v.sort_order !== undefined) {
    const n = Number(v.sort_order);
    if (!Number.isInteger(n) || n < 0) return { error: 'sort_order inválido' };
    out.sort_order = n;
  }
  return { variant: out };
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, 'admin');
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    const sanitized = sanitizeVariant(await request.json());
    if ('error' in sanitized) {
      return NextResponse.json({ error: sanitized.error }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from('pt_product_variants')
      .upsert(sanitized.variant, { onConflict: 'product_id,id' });
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
