'use client';

import { useState, useEffect, useMemo } from 'react';
import { PRODUCTS } from './constants';
import { Product } from './types';
import { fetchProductOverrides, fetchCustomProducts } from './supabase-data';

/**
 * Hook that returns products merged with admin overrides.
 * Reads from Supabase first; falls back to localStorage if Supabase is unavailable.
 */
export function useProducts(): Product[] {
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [disabledIds, setDisabledIds] = useState<string[]>([]);
  const [customProducts, setCustomProducts] = useState<Array<{ id: string; name: string; cat: string; price: number; desc: string; image_url?: string | null }>>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadFromSupabase() {
      try {
        const [overrides, custom] = await Promise.all([
          fetchProductOverrides(),
          fetchCustomProducts(),
        ]);

        // If we got data from Supabase, use it
        if (!cancelled && (overrides.length > 0 || custom.length > 0)) {
          const names: Record<string, string> = {};
          const disabled: string[] = [];
          const imgs: Record<string, string> = {};

          for (const o of overrides) {
            if (o.name_override) names[o.id] = o.name_override;
            if (o.disabled) disabled.push(o.id);
            if (o.image_url) imgs[o.id] = o.image_url;
          }

          // Custom product images
          for (const cp of custom) {
            if (cp.image_url) imgs[cp.id] = cp.image_url;
          }

          setNameOverrides(names);
          setDisabledIds(disabled);
          setImageUrls(imgs);
          setCustomProducts(custom.map(cp => ({
            id: cp.id,
            name: cp.name,
            cat: cp.category,
            price: cp.price,
            desc: cp.description || '',
            image_url: cp.image_url,
          })));
          setLoaded(true);
          return;
        }
      } catch (e) {
        console.error('Supabase load failed, falling back to localStorage:', e);
      }

      // Fallback to localStorage
      if (!cancelled) {
        loadFromLocalStorage();
      }
    }

    function loadFromLocalStorage() {
      try {
        const names = localStorage.getItem('playtime_product_names');
        if (names) setNameOverrides(JSON.parse(names));

        const disabled = localStorage.getItem('playtime_disabled');
        if (disabled) setDisabledIds(JSON.parse(disabled));

        const custom = localStorage.getItem('playtime_custom_products');
        if (custom) setCustomProducts(JSON.parse(custom));

        const imgs = localStorage.getItem('playtime_image_urls');
        if (imgs) setImageUrls(JSON.parse(imgs));
      } catch {}
      setLoaded(true);
    }

    loadFromSupabase();
    return () => { cancelled = true; };
  }, []);

  const products = useMemo(() => {
    if (!loaded) return PRODUCTS;

    // Filter out disabled built-in products
    const active = PRODUCTS.filter(p => !disabledIds.includes(p.id));

    // Apply name and image overrides
    const overridden = active.map(p => ({
      ...p,
      name: nameOverrides[p.id] || p.name,
      image: imageUrls[p.id] || p.image,
    }));

    // Add custom products
    const custom: Product[] = customProducts.map(cp => ({
      id: cp.id,
      name: cp.name,
      category: cp.cat as Product['category'],
      description: cp.desc || '',
      price: cp.price,
      image: imageUrls[cp.id] || cp.image_url || undefined,
    }));

    return [...overridden, ...custom];
  }, [loaded, nameOverrides, disabledIds, customProducts, imageUrls]);

  return products;
}
