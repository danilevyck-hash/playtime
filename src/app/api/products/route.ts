import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireRole } from '@/lib/admin-auth';

// Column allowlist for pt_products. A raw {...fields} spread let a crafted POST
// write ANY column (or garbage types); only these pass, type-checked.
const PRODUCT_STRING_MAX: Record<string, number> = { name: 200, category: 50, description: 2000, image_url: 500, variant_label: 100 };
const PRODUCT_BOOL_COLS = ['active', 'featured', 'popular'] as const;
const PRODUCT_INT_COLS = ['max_quantity', 'min_quantity', 'quantity_step', 'sort_order'] as const;

function sanitizeProduct(input: unknown): { fields: Record<string, unknown> } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'Producto inválido' };
  const p = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, max] of Object.entries(PRODUCT_STRING_MAX)) {
    if (p[key] === undefined) continue;
    if (p[key] === null) { out[key] = null; continue; }
    if (typeof p[key] !== 'string') return { error: `Campo inválido: ${key}` };
    const v = p[key] as string;
    if (key === 'name' && v.trim().length === 0) return { error: 'Nombre requerido' };
    if (v.length > max) return { error: `${key} excede ${max} caracteres` };
    out[key] = key === 'name' ? v.trim() : v;
  }
  if (p.price !== undefined) {
    const price = Number(p.price);
    if (!Number.isFinite(price) || price < 0) return { error: 'Precio inválido (>= 0)' };
    out.price = price;
  }
  for (const key of PRODUCT_BOOL_COLS) {
    if (p[key] === undefined) continue;
    if (typeof p[key] !== 'boolean') return { error: `${key} debe ser booleano` };
    out[key] = p[key];
  }
  for (const key of PRODUCT_INT_COLS) {
    if (p[key] === undefined) continue;
    if (p[key] === null) { out[key] = null; continue; }
    const n = Number(p[key]);
    if (!Number.isInteger(n) || n < 0) return { error: `${key} inválido` };
    out[key] = n;
  }
  return { fields: out };
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
    const product = await request.json();
    const id = typeof product?.id === 'string' && product.id ? product.id : undefined;
    const sanitized = sanitizeProduct(product);
    if ('error' in sanitized) {
      return NextResponse.json({ error: sanitized.error }, { status: 400 });
    }
    const fields = sanitized.fields;

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
      return NextResponse.json({ error: 'No se pudo guardar el producto' }, { status: 500 });
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
