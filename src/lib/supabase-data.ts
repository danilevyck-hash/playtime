import { supabase } from './supabase';

// ─── Types ───
export interface ProductOverride {
  id: string;
  name_override: string | null;
  price_override: number | null;
  description_override: string | null;
  category_override: string | null;
  disabled: boolean;
  image_url: string | null;
}

export interface CustomProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  image_url: string | null;
  active: boolean;
}

// ─── Product Overrides ───

export async function fetchProductOverrides(): Promise<ProductOverride[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('pt_product_overrides')
      .select('*');
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('fetchProductOverrides error:', e);
    return [];
  }
}


export async function fetchCustomProducts(): Promise<CustomProduct[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('pt_custom_products')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('fetchCustomProducts error:', e);
    return [];
  }
}

export async function fetchAllCustomProducts(): Promise<CustomProduct[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('pt_custom_products')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('fetchAllCustomProducts error:', e);
    return [];
  }
}

// ─── Settings (reels, etc.) ───

// Browser-side cache: visitors re-read the same keys on every mount (categories,
// cart, checkout…). Keep each value for a few minutes per tab. The admin
// (/admin) always reads fresh and never fills the cache, and every admin save
// clears it (revalidateSite), so Daniel sees his own edits right away.
// Server-side reads are not cached here (ISR + revalidatePath handle those).
const SETTINGS_TTL_MS = 5 * 60_000;
const settingsCache = new Map<string, { at: number; value: unknown }>();

function canCacheSettings(): boolean {
  return typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin');
}

export function clearSettingsCache(): void {
  settingsCache.clear();
}

function cachedSetting(key: string): { hit: boolean; value: unknown } {
  if (!canCacheSettings()) return { hit: false, value: null };
  const e = settingsCache.get(key);
  if (!e || Date.now() - e.at > SETTINGS_TTL_MS) return { hit: false, value: null };
  return { hit: true, value: e.value };
}

function storeSetting(key: string, value: unknown): void {
  if (canCacheSettings()) settingsCache.set(key, { at: Date.now(), value });
}

export async function fetchSetting<T>(key: string): Promise<T | null> {
  if (!supabase) return null;
  const c = cachedSetting(key);
  if (c.hit) return c.value as T | null;
  try {
    const { data, error } = await supabase
      .from('pt_settings')
      .select('value')
      .eq('key', key)
      .single();
    if (error) {
      if (error.code === 'PGRST116') { storeSetting(key, null); return null; } // not found
      throw error;
    }
    storeSetting(key, data?.value ?? null);
    return data?.value as T;
  } catch (e) {
    console.error(`fetchSetting(${key}) error:`, e);
    return null;
  }
}

/** Several keys in ONE query. Missing keys come back as null. */
export async function fetchSettings(keys: string[]): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const k of keys) {
    const c = cachedSetting(k);
    if (c.hit) out[k] = c.value; else missing.push(k);
  }
  if (!supabase || missing.length === 0) return out;
  try {
    const { data, error } = await supabase.from('pt_settings').select('key, value').in('key', missing);
    if (error) throw error;
    const found = new Map((data || []).map((r) => [String(r.key), r.value as unknown]));
    for (const k of missing) {
      out[k] = found.get(k) ?? null;
      storeSetting(k, out[k]);
    }
  } catch (e) {
    console.error('fetchSettings error:', e);
  }
  return out;
}

export async function fetchEventAreas(): Promise<{ name: string; price: number }[]> {
  try {
    const areas = await fetchSetting<{ name: string; price: number }[]>('event_areas');
    if (areas && areas.length > 0) return areas;
  } catch (e) {
    console.error('fetchEventAreas error:', e);
  }
  // Dynamic import to avoid circular dependency
  const { EVENT_AREAS } = await import('./types');
  return EVENT_AREAS;
}

export async function fetchLogoUrl(): Promise<string | null> {
  return fetchSetting<string>('site_logo_url');
}

// ─── Product Image Gallery ───

export async function fetchProductImages(productId: string): Promise<string[]> {
  const data = await fetchSetting<string[]>(`product_images_${productId}`);
  return data || [];
}

/** Batch version: one `.in()` query for many products instead of N round-trips.
 *  Returns a map productId → gallery urls (only products that have a gallery). */
export async function fetchProductImagesBatch(productIds: string[]): Promise<Record<string, string[]>> {
  if (!supabase || productIds.length === 0) return {};
  const keys = productIds.map((id) => `product_images_${id}`);
  const out: Record<string, string[]> = {};
  try {
    const { data, error } = await supabase.from('pt_settings').select('key, value').in('key', keys);
    if (error || !data) return out;
    for (const row of data) {
      const id = String(row.key).replace(/^product_images_/, '');
      if (Array.isArray(row.value)) {
        out[id] = row.value.filter((u): u is string => typeof u === 'string');
      }
    }
  } catch (e) {
    console.error('fetchProductImagesBatch error:', e);
  }
  return out;
}

// ─── Products (new DB-first approach) ───

export interface DBProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  image_url: string | null;
  active: boolean;
  featured: boolean;
  popular: boolean;
  max_quantity: number | null;
  min_quantity: number | null;
  quantity_step: number | null;
  variant_label: string | null;
  sort_order: number;
}

export interface DBProductVariant {
  id: string;
  product_id: string;
  label: string;
  price: number | null;
  image_url: string | null;
  description?: string | null;
  sort_order: number;
}

export async function fetchDBProducts(): Promise<DBProduct[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pt_products')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) { console.error('fetchDBProducts error:', error); return []; }
  return data || [];
}

export async function fetchDBProductVariants(): Promise<DBProductVariant[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pt_product_variants')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) { console.error('fetchDBProductVariants error:', error); return []; }
  return data || [];
}
