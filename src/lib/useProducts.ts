'use client';

import { useProductsContext } from '@/components/ProductsProvider';
import { Product } from './types';

/**
 * Products for client surfaces. Reads the shared ProductsProvider (single loader
 * for the whole app). Pass `initial` (server-fetched via fetchCatalogProducts) so
 * the first paint on server-rendered catalog pages shows the full list instead of
 * an empty flash — it's used only until the provider finishes its own load, after
 * which the live list takes over.
 */
export function useProducts(initial?: Product[]): Product[] {
  const { products, loaded } = useProductsContext();
  if (!loaded && initial && initial.length > 0) return initial;
  return products;
}
