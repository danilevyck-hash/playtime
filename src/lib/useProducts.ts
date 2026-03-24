'use client';

import { useState, useEffect, useMemo } from 'react';
import { PRODUCTS } from './constants';
import { Product, Category } from './types';
import { fetchProductOverrides, fetchCustomProducts, ProductOverride, CustomProduct } from './supabase-data';

/**
 * Hook that returns products merged with admin overrides.
 * Reads from Supabase first; falls back to localStorage if Supabase is unavailable.
 */
export function useProducts(): Product[] {
  const [overrides, setOverrides] = useState<ProductOverride[]>([]);
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [ov, cp] = await Promise.all([
          fetchProductOverrides(),
          fetchCustomProducts(),
        ]);
        if (!cancelled) {
          setOverrides(ov);
          setCustomProducts(cp);
          setLoaded(true);
        }
      } catch (e) {
        console.error('Supabase load failed:', e);
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const products = useMemo(() => {
    if (!loaded) return PRODUCTS;

    // Build override map
    const ovMap = new Map<string, ProductOverride>();
    for (const o of overrides) ovMap.set(o.id, o);

    // Filter out disabled built-in products, apply all overrides
    const builtIn: Product[] = PRODUCTS
      .filter(p => {
        const ov = ovMap.get(p.id);
        return !ov?.disabled;
      })
      .map(p => {
        const ov = ovMap.get(p.id);
        if (!ov) return p;
        return {
          ...p,
          name: ov.name_override || p.name,
          price: ov.price_override ?? p.price,
          description: ov.description_override ?? p.description,
          category: (ov.category_override as Category) || p.category,
          image: ov.image_url || p.image,
        };
      });

    // Add custom products
    const custom: Product[] = customProducts.map(cp => ({
      id: cp.id,
      name: cp.name,
      category: cp.category as Category,
      description: cp.description || '',
      price: cp.price,
      image: cp.image_url || undefined,
    }));

    return [...builtIn, ...custom];
  }, [loaded, overrides, customProducts]);

  return products;
}
