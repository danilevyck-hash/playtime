/**
 * Cart item ids encode an optional variant as `productId--variantId`.
 *
 * INVARIANT: product ids and variant ids must NOT contain the "--" separator
 * (they're kebab-case slugs, so they don't). The productId is everything before
 * the FIRST "--", matching the historical `split('--')[0]` behaviour.
 */
const SEP = '--';

export function buildCartId(productId: string, variantId?: string | null): string {
  return variantId ? `${productId}${SEP}${variantId}` : productId;
}

export function parseCartId(cartId: string): { productId: string; variantId?: string } {
  const idx = cartId.indexOf(SEP);
  if (idx === -1) return { productId: cartId };
  return { productId: cartId.slice(0, idx), variantId: cartId.slice(idx + SEP.length) };
}

/** The base product id of a cart id (strips the variant suffix if present). */
export function baseProductId(cartId: string): string {
  return parseCartId(cartId).productId;
}
