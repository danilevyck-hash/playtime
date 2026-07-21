import { cache } from 'react';
import { Product } from './types';
import { loadProducts, mergeProducts } from './products';

/**
 * Server-side catalog fetch, deduped per request via React.cache — so a page and
 * its generateMetadata share ONE round-trip. Pair with `export const revalidate`
 * on the page for ISR. Only import this from Server Components — React's cache()
 * is Server-Component only (that's why it's split out of products.ts).
 */
export const fetchCatalogProducts = cache(async (): Promise<Product[]> => {
  try {
    return await loadProducts();
  } catch (e) {
    console.error('fetchCatalogProducts error:', e);
    return mergeProducts([], [], [], [], []);
  }
});
