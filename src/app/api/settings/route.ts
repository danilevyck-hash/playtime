export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireRole } from '@/lib/admin-auth';

// Exactly the keys the admin UI edits via apiUpsertSetting — anything else is
// rejected so this route can't be used to write arbitrary pt_settings rows.
const ALLOWED_KEYS = new Set([
  'category_order', 'category_overrides', 'custom_categories',
  'homepage_content', 'featured_products', 'cart_suggestions', 'checkout_suggestions',
  'event_areas', 'contact_info', 'site_logo_url', 'testimonials', 'terms_conditions',
  'site_texts', 'about_intro', 'about_stats', 'faq_items', 'cross_sell_rules',
]);
// Per-product galleries use dynamic keys (product_images_<id> / variant_images_<id>).
const ALLOWED_KEY_PREFIXES = [/^product_images_[A-Za-z0-9_-]+$/, /^variant_images_[A-Za-z0-9_-]+$/];
const MAX_VALUE_BYTES = 512 * 1024; // 512KB serialized

function isAllowedKey(key: string): boolean {
  return ALLOWED_KEYS.has(key) || ALLOWED_KEY_PREFIXES.some((re) => re.test(key));
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

    const { key, value } = await request.json();

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key requerido' }, { status: 400 });
    }
    if (!isAllowedKey(key)) {
      return NextResponse.json({ error: 'Configuración no permitida' }, { status: 400 });
    }
    if (Buffer.byteLength(JSON.stringify(value ?? null), 'utf8') > MAX_VALUE_BYTES) {
      return NextResponse.json({ error: 'El valor es demasiado grande' }, { status: 400 });
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
