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

export async function fetchSetting<T>(key: string): Promise<T | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('pt_settings')
      .select('value')
      .eq('key', key)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null; // not found
      throw error;
    }
    return data?.value as T;
  } catch (e) {
    console.error(`fetchSetting(${key}) error:`, e);
    return null;
  }
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
