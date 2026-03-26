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
  if (!supabase) return false;
  try {
    const { error } = await supabase
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
  if (!supabase) return false;
  try {
    const { error } = await supabase
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
  if (!supabase) return false;
  try {
    const { error } = await supabase
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
  } catch {}
  // Dynamic import to avoid circular dependency
  const { EVENT_AREAS } = await import('./types');
  return EVENT_AREAS;
}

export async function upsertSetting(key: string, value: unknown): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('pt_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error(`upsertSetting(${key}) error:`, e);
    return false;
  }
}
