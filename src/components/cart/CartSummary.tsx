'use client';

import { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';
import { formatCurrency } from '@/lib/format';
import { CREDIT_CARD_SURCHARGE } from '@/lib/constants';
import { getSiteTexts, DEFAULT_SITE_TEXTS, SiteTexts } from '@/lib/site-texts';

interface CartSummaryProps {
  showSurcharge?: boolean;
  paymentMethod?: 'bank_transfer' | 'credit_card';
}

/** Round to 2 decimal places — mirrors checkout/page.tsx so totals match. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function CartSummary({ showSurcharge, paymentMethod }: CartSummaryProps) {
  const { subtotal, itemCount } = useCart();
  const [texts, setTexts] = useState<SiteTexts>(DEFAULT_SITE_TEXTS);
  // Same shape as checkout/page.tsx:117-119: surcharge on (subtotal + transport),
  // rounded. Transport isn't known in the cart yet (picked at checkout), so it's 0
  // here — but the base and the round2 now match so the total never drifts by a cent.
  const surcharge = paymentMethod === 'credit_card' ? round2(subtotal * CREDIT_CARD_SURCHARGE) : 0;
  const total = round2(subtotal + surcharge);

  useEffect(() => {
    getSiteTexts().then(setTexts);
  }, []);

  return (
    <div className="bg-cream rounded-2xl p-6">
      <p className="font-body text-xs text-gray-400 mb-3">{itemCount} {itemCount === 1 ? 'art\u00edculo' : 'art\u00edculos'}</p>
      <div className="flex justify-between items-center mb-3">
        <span className="font-body text-gray-600">Subtotal</span>
        <span className="font-heading font-semibold text-gray-800">{formatCurrency(subtotal)}</span>
      </div>
      {showSurcharge && paymentMethod === 'credit_card' && (
        <div className="flex justify-between items-center mb-3">
          <span className="font-body text-gray-600">Recargo tarjeta (5%)</span>
          <span className="font-heading font-semibold text-orange">{formatCurrency(surcharge)}</span>
        </div>
      )}
      <div className="border-t border-gray-200 pt-3 mt-3 flex justify-between items-center">
        <span className="font-heading font-bold text-lg text-gray-800">Total</span>
        <span className="font-heading font-bold text-2xl text-purple">{formatCurrency(total)}</span>
      </div>
      <p className="font-body text-xs text-gray-400 mt-3">{texts.cart_transport_message}</p>
    </div>
  );
}
