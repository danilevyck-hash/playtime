import { supabase, supabaseAdmin } from './supabase';

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

export interface ReelData {
  url: string;
  id: string;
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

export async function upsertProductOverride(override: Partial<ProductOverride> & { id: string }): Promise<boolean> {
  const db = supabaseAdmin || supabase;
  if (!db) return false;
  try {
    const { error } = await db
      .from('pt_product_overrides')
      .upsert({ ...override, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('upsertProductOverride error:', e);
    return false;
  }
}

// ─── Custom Products ───

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

export async function upsertCustomProduct(product: CustomProduct): Promise<boolean> {
  const db = supabaseAdmin || supabase;
  if (!db) return false;
  try {
    const { error } = await db
      .from('pt_custom_products')
      .upsert(product, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('upsertCustomProduct error:', e);
    return false;
  }
}

export async function deleteCustomProduct(id: string): Promise<boolean> {
  const db = supabaseAdmin || supabase;
  if (!db) return false;
  try {
    const { error } = await db
      .from('pt_custom_products')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('deleteCustomProduct error:', e);
    return false;
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

export async function upsertProductImages(productId: string, urls: string[]): Promise<boolean> {
  return upsertSetting(`product_images_${productId}`, urls);
}

// ─── Variant Images ───

export async function fetchVariantImages(productId: string): Promise<Record<string, string>> {
  const data = await fetchSetting<Record<string, string>>(`variant_images_${productId}`);
  return data || {};
}

export async function upsertVariantImages(productId: string, images: Record<string, string>): Promise<boolean> {
  return upsertSetting(`variant_images_${productId}`, images);
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
  max_quantity: number | null;
  variant_label: string | null;
  sort_order: number;
}

export interface DBProductVariant {
  id: string;
  product_id: string;
  label: string;
  price: number | null;
  image_url: string | null;
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

export async function upsertDBProduct(product: Partial<DBProduct> & { id: string }): Promise<boolean> {
  const db = supabaseAdmin || supabase;
  if (!db) return false;
  const { error } = await db.from('pt_products').upsert(product, { onConflict: 'id' });
  if (error) { console.error('upsertDBProduct error:', error); return false; }
  return true;
}

export async function deleteDBProduct(id: string): Promise<boolean> {
  const db = supabaseAdmin || supabase;
  if (!db) return false;
  const { error } = await db.from('pt_products').delete().eq('id', id);
  if (error) { console.error('deleteDBProduct error:', error); return false; }
  return true;
}

export async function upsertDBVariant(variant: DBProductVariant): Promise<boolean> {
  const db = supabaseAdmin || supabase;
  if (!db) return false;
  const { error } = await db.from('pt_product_variants').upsert(variant, { onConflict: 'product_id,id' });
  if (error) { console.error('upsertDBVariant error:', error); return false; }
  return true;
}

export async function deleteDBVariant(productId: string, variantId: string): Promise<boolean> {
  const db = supabaseAdmin || supabase;
  if (!db) return false;
  const { error } = await db.from('pt_product_variants').delete().eq('product_id', productId).eq('id', variantId);
  if (error) { console.error('deleteDBVariant error:', error); return false; }
  return true;
}

export async function bulkUpdateProductOrder(ids: string[]): Promise<boolean> {
  const db = supabaseAdmin || supabase;
  if (!db) return false;
  const updates = ids.map((id, i) => db.from('pt_products').update({ sort_order: i }).eq('id', id));
  const results = await Promise.allSettled(updates);
  return results.every(r => r.status === 'fulfilled');
}

export async function upsertSetting(key: string, value: unknown): Promise<boolean> {
  const db = supabaseAdmin || supabase;
  if (!db) return false;
  try {
    const { error } = await db
      .from('pt_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error(`upsertSetting(${key}) error:`, e);
    return false;
  }
}
