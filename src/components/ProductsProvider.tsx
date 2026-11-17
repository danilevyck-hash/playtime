'use client';

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { Product } from '@/lib/types';
import { loadProducts } from '@/lib/products';

interface ProductsCtx {
  products: Product[];
  loaded: boolean;
  /** Starts the one-per-visit load. Called by useProducts, so pages that never
   *  show products (home, nosotros, preguntas…) don't read the catalog at all. */
  ensureLoaded: () => void;
}

const ProductsContext = createContext<ProductsCtx>({ products: [], loaded: false, ensureLoaded: () => {} });

// Module-level cache: survives remounts and client-side navigation, so a visit
// reads pt_products + pt_product_variants ONCE. `inFlight` dedupes concurrent loads.
// No polling / realtime / focus refetch: they re-read both tables every minute
// for every open tab (Supabase Disk IO). Prices are re-checked by /api/orders.
let cacheProducts: Product[] = [];
let cacheLoaded = false;
let inFlight: Promise<Product[]> | null = null;

function loadOnce(): Promise<Product[]> {
  if (cacheLoaded) return Promise.resolve(cacheProducts);
  if (inFlight) return inFlight;
  inFlight = loadProducts()
    .then((list) => {
      cacheProducts = list;
      cacheLoaded = true;
      return list;
    })
    .catch((e) => {
      console.error('ProductsProvider load failed:', e);
      return cacheProducts;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(cacheProducts);
  const [loaded, setLoaded] = useState(cacheLoaded);

  const ensureLoaded = useCallback(() => {
    loadOnce().then((list) => { setProducts(list); setLoaded(true); });
  }, []);

  const value = useMemo(() => ({ products, loaded, ensureLoaded }), [products, loaded, ensureLoaded]);
  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function useProductsContext(): ProductsCtx {
  return useContext(ProductsContext);
}
