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

// The product/manualidades images were converted to WebP (originals moved out of
// the build). The DB was seeded with the old .png/.jpg paths, so normalize any
// local reference to the .webp that actually ships. Remote (Supabase) URLs and
// already-.webp paths pass through untouched.
const CONVERTED = /^\/images\/(products|manualidades)\/[^/]+\.(png|jpe?g)$/i;
export function normalizeImage(url?: string | null): string | undefined {
  if (!url) return undefined;
  return CONVERTED.test(url) ? url.replace(/\.(png|jpe?g)$/i, '.webp') : url;
}

/**
 * Pure DB-first merge — the single place that turns raw DB rows (or the legacy
 * overrides/custom fallback, or constants) into the Product[] the UI renders.
 * Shared by the server fetch (fetchCatalogProducts) and the client provider so
 * both produce identical results.
 */
export function mergeProducts(
  dbProducts: DBProduct[],
  dbVariants: DBProductVariant[],
  overrides: ProductOverride[],
  customProducts: CustomProduct[],
  productOrder: string[],
): Product[] {
  if (dbProducts.length > 0) {
    const variantMap = new Map<string, ProductVariant[]>();
    for (const v of dbVariants) {
      const arr = variantMap.get(v.product_id) || [];
      arr.push({
        id: v.id,
        label: v.label,
        price: v.price ?? undefined,
        image: normalizeImage(v.image_url),
        description: v.description ?? undefined,
      });
      variantMap.set(v.product_id, arr);
    }
    return dbProducts
      .filter((p) => p.active)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category as Category,
        description: p.description,
        price: p.price,
        image: normalizeImage(p.image_url),
        featured: p.featured,
        popular: p.popular ?? false,
        maxQuantity: p.max_quantity ?? undefined,
        minQuantity: p.min_quantity ?? undefined,
        quantityStep: p.quantity_step ?? undefined,
        variants: variantMap.get(p.id),
        variantLabel: p.variant_label ?? undefined,
      }));
  }

  // Legacy fallback: constants + overrides + custom.
  const ovMap = new Map<string, ProductOverride>();
  for (const o of overrides) ovMap.set(o.id, o);

  const builtIn: Product[] = PRODUCTS
    .filter((p) => !ovMap.get(p.id)?.disabled)
    .map((p) => {
      const ov = ovMap.get(p.id);
      if (!ov) return p;
      return {
        ...p,
        name: ov.name_override || p.name,
        price: ov.price_override ?? p.price,
        description: ov.description_override ?? p.description,
        category: (ov.category_override as Category) || p.category,
        image: normalizeImage(ov.image_url || p.image),
      };
    });

  const custom: Product[] = customProducts.map((cp) => ({
    id: cp.id,
    name: cp.name,
    category: cp.category as Category,
    description: cp.description || '',
    price: cp.price,
    image: normalizeImage(cp.image_url),
  }));

  const result = [...builtIn, ...custom];
  if (productOrder.length > 0) {
    const orderMap = new Map(productOrder.map((id, idx) => [id, idx]));
    result.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity));
  }
  return result;
}

/**
 * Raw fetch + merge. Shared by the client provider and the server fetch. Lives
 * here (no `react` import) so it's safe to bundle into client components.
 */
export async function loadProducts(): Promise<Product[]> {
  const [products, variants] = await Promise.all([fetchDBProducts(), fetchDBProductVariants()]);
  if (products.length > 0) return mergeProducts(products, variants, [], [], []);
  const [ov, cp, order] = await Promise.all([
    fetchProductOverrides(),
    fetchCustomProducts(),
    fetchSetting<string[]>('product_order'),
  ]);
  return mergeProducts([], [], ov, cp, order || []);
}
