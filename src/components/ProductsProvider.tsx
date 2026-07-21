'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Product } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { loadProducts } from '@/lib/products';

interface ProductsCtx {
  products: Product[];
  loaded: boolean;
}

const ProductsContext = createContext<ProductsCtx>({ products: [], loaded: false });

// Module-level cache (cross-sell.ts pattern): survives remounts and is shared by
// every subscriber, so the whole app does ONE initial fetch instead of one per
// surface. `inFlight` dedupes concurrent loads.
let cacheProducts: Product[] = [];
let cacheLoaded = false;
let inFlight: Promise<Product[]> | null = null;

function loadOnce(): Promise<Product[]> {
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

/**
 * Single products provider. Mount once near the app root. Runs one realtime
 * subscription + one 60s poll + one visibility refetch for the entire tree,
 * replacing the per-instance effects the old useProducts hook fired on each of
 * the ~5 surfaces that render products.
 */
export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(cacheProducts);
  const [loaded, setLoaded] = useState(cacheLoaded);

  const refresh = useCallback(async () => {
    inFlight = null; // force a fresh fetch (not the memoized initial one)
    const list = await loadOnce();
    setProducts(list);
    setLoaded(true);
  }, []);

  // Initial load (uses the shared in-flight promise if one is already running).
  useEffect(() => {
    let alive = true;
    loadOnce().then((list) => { if (alive) { setProducts(list); setLoaded(true); } });
    return () => { alive = false; };
  }, []);

  // Realtime: refetch when products/variants change in the DB.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pt_products' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pt_product_variants' }, () => refresh())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [refresh]);

  // Refetch when the tab regains focus (covers realtime being off in the dashboard).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // Fallback poll in case the realtime channel is silently dead.
  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  return <ProductsContext.Provider value={{ products, loaded }}>{children}</ProductsContext.Provider>;
}

export function useProductsContext(): ProductsCtx {
  return useContext(ProductsContext);
}
