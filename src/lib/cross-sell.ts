import { CartItem, Product } from './types';
import { fetchSetting } from './supabase-data';
import { DEFAULT_CROSS_SELL_RULES } from './default-cross-sell-rules';

export type CrossSellRules = Record<string, string[]>;

let _cached: CrossSellRules | null = null;
let _fetchPromise: Promise<CrossSellRules> | null = null;

export async function getCrossSellRules(): Promise<CrossSellRules> {
  if (_cached) return _cached;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetchSetting<CrossSellRules>('cross_sell_rules')
    .then(data => {
      _cached = data && Object.keys(data).length > 0 ? data : { ...DEFAULT_CROSS_SELL_RULES };
      return _cached;
    })
    .catch(() => {
      _cached = { ...DEFAULT_CROSS_SELL_RULES };
      return _cached;
    })
    .finally(() => { _fetchPromise = null; });

  return _fetchPromise;
}


export interface SuggestionResult {
  products: Product[];
  anchorName: string | null; // most expensive cart item that has rules — used for personalized label
}

/**
 * Build a contextual cross-sell list for the current cart.
 *
 * Algorithm:
 * 1. For each cart item, look up its rules → flat list of suggested IDs (priority order)
 * 2. Append fallback IDs (manual cart_suggestions / checkout_suggestions from admin)
 * 3. Dedupe, exclude items already in cart, exclude unknown IDs
 * 4. Return top N products + the most expensive cart item's name as the "anchor"
 */
export function buildCrossSellSuggestions(
  cartItems: CartItem[],
  allProducts: Product[],
  rules: CrossSellRules,
  fallbackIds: string[],
  max: number,
): SuggestionResult {
  const cartIds = new Set(cartItems.map(i => i.productId));
  const productById = new Map(allProducts.map(p => [p.id, p]));

  // Pick anchor: most expensive cart item that has rules
  let anchor: CartItem | null = null;
  for (const item of cartItems) {
    if (!rules[item.productId]) continue;
    if (!anchor || item.unitPrice > anchor.unitPrice) anchor = item;
  }

  // Gather rule-based suggestions in priority order
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const item of cartItems) {
    const ids = rules[item.productId] || [];
    for (const id of ids) {
      if (cartIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }
  }

  // Fill with fallback IDs
  for (const id of fallbackIds) {
    if (cartIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }

  const products = ordered
    .map(id => productById.get(id))
    .filter((p): p is Product => !!p)
    .slice(0, max);

  // Strip parenthetical "Show de Títeres con Lala" → "Show de Títeres"
  const anchorName = anchor ? anchor.name.replace(/ — .*$/, '').replace(/ con .*$/, '') : null;

  return { products, anchorName };
}
