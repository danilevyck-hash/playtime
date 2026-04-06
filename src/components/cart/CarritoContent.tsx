'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import CartItemComponent from '@/components/cart/CartItem';
import CartSummary from '@/components/cart/CartSummary';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { getSiteTexts, DEFAULT_SITE_TEXTS, SiteTexts } from '@/lib/site-texts';

export default function CarritoContent() {
  const { items, clearCart } = useCart();
  const [texts, setTexts] = useState<SiteTexts>(DEFAULT_SITE_TEXTS);

  useEffect(() => {
    getSiteTexts().then(setTexts);
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

      <div className="mb-8">
        {items.map((item) => (
          <CartItemComponent key={item.productId} item={item} />
        ))}
      </div>

      <CartSummary />

      <div className="bg-gray-50 rounded-xl p-4 mt-4">
        <p className="font-body text-sm text-gray-500">
          {texts.cart_transport_message}
        </p>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Link href="/catalogo" className="flex-1">
          <Button variant="outline" className="w-full">{texts.cart_cta_add_more}</Button>
        </Link>
        <Link href="/checkout" className="flex-1">
          <Button className="w-full" size="lg">{texts.cart_cta_checkout} &rarr;</Button>
        </Link>
      </div>

      <div className="mt-6 text-center">
        <button
          onClick={() => { if (window.confirm('\u00bfSegura que quieres empezar de nuevo? Se borrar\u00e1 todo lo que seleccionaste.')) clearCart(); }}
          className="text-xs font-body text-gray-400 hover:text-pink transition-colors"
        >
          {texts.cart_clear_label}
        </button>
      </div>
    </div>
  );
}
