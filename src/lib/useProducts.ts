'use client';

import { useState, useEffect, useMemo } from 'react';
import { PRODUCTS } from './constants';
import { Product, ProductVariant, Category } from './types';
import {
  fetchDBProducts,
  fetchDBProductVariants,
  fetchProductOverrides,
  fetchCustomProducts,
  fetchSetting,
  ProductOverride,
  CustomProduct,
  DBProduct,
  DBProductVariant,
} from './supabase-data';

/**
 * Hook that returns products.
 * Tries DB-first (pt_products table). If empty, falls back to
 * constants.ts + overrides + custom products (legacy behaviour).
 */
export function useProducts(): Product[] {
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([]);
  const [dbVariants, setDbVariants] = useState<DBProductVariant[]>([]);
  const [overrides, setOverrides] = useState<ProductOverride[]>([]);
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  const [productOrder, setProductOrder] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Try DB-first
        const [products, variants] = await Promise.all([
          fetchDBProducts(),
          fetchDBProductVariants(),
        ]);

        if (!cancelled && products.length > 0) {
          setDbProducts(products);
          setDbVariants(variants);
          setLoaded(true);
          return;
        }

        // Fallback: legacy system
        const [ov, cp, order] = await Promise.all([
          fetchProductOverrides(),
          fetchCustomProducts(),
          fetchSetting<string[]>('product_order'),
        ]);
        if (!cancelled) {
          setOverrides(ov);
          setCustomProducts(cp);
          if (order) setProductOrder(order);
          setLoaded(true);
        }
      } catch (e) {
        console.error('useProducts load failed:', e);
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const products = useMemo(() => {
    if (!loaded) return PRODUCTS;

    // ── DB-first path ──
    if (dbProducts.length > 0) {
      // Build variant map: productId -> ProductVariant[]
      const variantMap = new Map<string, ProductVariant[]>();
      for (const v of dbVariants) {
        const arr = variantMap.get(v.product_id) || [];
        arr.push({
          id: v.id,
          label: v.label,
          price: v.price ?? undefined,
          image: v.image_url ?? undefined,
        });
        variantMap.set(v.product_id, arr);
      }

      return dbProducts
        .filter(p => p.active)
        .map(p => ({
          id: p.id,
          name: p.name,
          category: p.category as Category,
          description: p.description,
          price: p.price,
          image: p.image_url || undefined,
          featured: p.featured,
          maxQuantity: p.max_quantity ?? undefined,
          variants: variantMap.get(p.id),
          variantLabel: p.variant_label ?? undefined,
        }));
    }

    // ── Legacy fallback path ──
    const ovMap = new Map<string, ProductOverride>();
    for (const o of overrides) ovMap.set(o.id, o);

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

    const custom: Product[] = customProducts.map(cp => ({
      id: cp.id,
      name: cp.name,
      category: cp.category as Category,
      description: cp.description || '',
      price: cp.price,
      image: cp.image_url || undefined,
    }));

    const result = [...builtIn, ...custom];

    if (productOrder.length > 0) {
      const orderMap = new Map(productOrder.map((id, idx) => [id, idx]));
      result.sort((a, b) => {
        const ia = orderMap.get(a.id) ?? Infinity;
        const ib = orderMap.get(b.id) ?? Infinity;
        return ia - ib;
      });
    }

    return result;
  }, [loaded, dbProducts, dbVariants, overrides, customProducts, productOrder]);

  return products;
}
