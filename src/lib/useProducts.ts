'use client';

import { useState, useEffect, useMemo } from 'react';
import { PRODUCTS } from './constants';
import { Product } from './types';

/**
 * Hook that returns products merged with admin overrides from localStorage.
 * - Name overrides (playtime_product_names)
 * - Disabled products (playtime_disabled)
 * - Custom products (playtime_custom_products)
 * - Image URL overrides (playtime_image_urls)
 */
export function useProducts(): Product[] {
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [disabledIds, setDisabledIds] = useState<string[]>([]);
  const [customProducts, setCustomProducts] = useState<Array<{ id: string; name: string; cat: string; price: number; desc: string }>>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
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
      image: imageUrls[cp.id] || undefined,
    }));

    return [...overridden, ...custom];
  }, [loaded, nameOverrides, disabledIds, customProducts, imageUrls]);

  return products;
}
