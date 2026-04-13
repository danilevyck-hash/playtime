'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import CartItemComponent from '@/components/cart/CartItem';
import CartSummary from '@/components/cart/CartSummary';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { getSiteTexts, DEFAULT_SITE_TEXTS, SiteTexts } from '@/lib/site-texts';
import { useProducts } from '@/lib/useProducts';
import { fetchSetting } from '@/lib/supabase-data';
import { formatCurrency } from '@/lib/format';

export default function CarritoContent() {
  const { items, clearCart, addItem } = useCart();
  const [texts, setTexts] = useState<SiteTexts>(DEFAULT_SITE_TEXTS);
  const [suggestionIds, setSuggestionIds] = useState<string[]>([]);
  const allProducts = useProducts();

  const addonSuggestions = useMemo(() => {
    const cartIds = new Set(items.map(i => i.productId));
    // If admin configured specific suggestions, use those (preserving order, excluding items already in cart)
    if (suggestionIds.length > 0) {
      const byId = new Map(allProducts.map(p => [p.id, p]));
      return suggestionIds
        .map(id => byId.get(id))
        .filter((p): p is NonNullable<typeof p> => !!p && !cartIds.has(p.id));
    }
    // Fallback: random addons
    const addons = allProducts.filter(p => p.category === 'addons' && !cartIds.has(p.id));
    const shuffled = [...addons].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, [allProducts, items, suggestionIds]);

  useEffect(() => {
    getSiteTexts().then(setTexts);
    fetchSetting<string[]>('cart_suggestions').then(ids => {
      if (Array.isArray(ids)) setSuggestionIds(ids);
    }).catch(() => { /* ignore */ });
  }, []);

  if (items.length === 0) {
    return (
      <div className="bg-beige min-h-[60vh]">
        <div className="max-w-6xl mx-auto px-4">
          <EmptyState icon="cart" title={texts.cart_empty_title} subtitle={texts.cart_empty_subtitle}>
            <Link href="/catalogo">
              <Button>{texts.catalog_cta}</Button>
            </Link>
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      {/* Urgency banner */}
      <div className="bg-teal/10 rounded-2xl p-3 mb-6 text-center">
        <p className="font-heading font-semibold text-sm text-teal">
          {texts.cart_urgency}
        </p>
      </div>

      <div className="mb-8">
        <h1 className="font-heading font-bold text-3xl text-purple">{texts.cart_title}</h1>
        <p className="font-body text-gray-500">{items.length} {items.length === 1 ? 'producto' : 'productos'}</p>
      </div>

      <div className="mb-8 space-y-2">
        {items.map((item) => (
          <CartItemComponent key={item.productId} item={item} />
        ))}
      </div>

      {/* Add-on suggestions */}
      {addonSuggestions.length > 0 && (
        <div className="mb-8">
          <h2 className="font-heading font-bold text-sm text-gray-500 mb-3">También piden con esto:</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
            {addonSuggestions.map(p => (
              <div key={p.id} className="flex-shrink-0 w-[120px] bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                {p.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.image} alt={p.name} className="w-full h-[80px] object-cover" />
                ) : (
                  <div className="w-full h-[80px] bg-gradient-to-br from-purple/5 to-teal/10 flex items-center justify-center">
                    <span className="text-2xl">{'\uD83C\uDF88'}</span>
                  </div>
                )}
                <div className="p-2">
                  <p className="font-heading font-semibold text-[11px] text-gray-800 line-clamp-2 leading-tight mb-1">{p.name}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold text-xs text-purple">{formatCurrency(p.price)}</span>
                    <button
                      onClick={() => addItem({ productId: p.id, name: p.name, category: p.category, unitPrice: p.price, image: p.image })}
                      className="w-6 h-6 rounded-full bg-orange text-white flex items-center justify-center text-sm font-bold hover:bg-orange/90 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CartSummary />

      <div className="mt-6 text-center">
        <button
          onClick={() => { if (window.confirm('\u00bfSegura que quieres empezar de nuevo? Se borrar\u00e1 todo lo que seleccionaste.')) clearCart(); }}
          className="text-xs font-body text-gray-400 hover:text-pink transition-colors"
        >
          {texts.cart_clear_label}
        </button>
      </div>

      {/* Spacer for sticky CTA */}
      <div className="h-28 sm:h-0" />

      {/* Sticky CTA — fixed on mobile */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 p-4 pb-safe z-40 sm:static sm:bg-transparent sm:border-0 sm:p-0 sm:mt-8 sm:backdrop-blur-none">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <Link href="/catalogo" className="flex-1 hidden sm:block">
            <Button variant="outline" className="w-full">{texts.cart_cta_add_more}</Button>
          </Link>
          <Link href="/checkout" className="flex-1">
            <Button className="w-full" size="lg">{texts.cart_cta_checkout} &rarr;</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
