'use client';

import { useEffect } from 'react';
import { useProductsContext } from '@/components/ProductsProvider';
import { Product } from './types';

/**
 * Products for client surfaces. Reads the shared ProductsProvider (single loader
 * for the whole app). Pass `initial` (server-fetched via fetchCatalogProducts) so
 * the first paint on server-rendered catalog pages shows the full list instead of
 * an empty flash. With `initial` the browser does not read the catalog; without
 * it (cart, checkout) the provider loads once per visit.
 */
export function useProducts(initial?: Product[]): Product[] {
  const { products, loaded, ensureLoaded } = useProductsContext();
  const hasInitial = !!initial && initial.length > 0;
  // Server-rendered catalog pages already bring the list (ISR, 60 s): no browser read.
  useEffect(() => { if (!hasInitial) ensureLoaded(); }, [hasInitial, ensureLoaded]);
  if (!loaded && hasInitial) return initial!;
  return products;
}
