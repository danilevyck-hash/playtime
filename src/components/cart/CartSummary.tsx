'use client';

import { useCart } from '@/context/CartContext';
import { formatCurrency } from '@/lib/format';
import { CREDIT_CARD_SURCHARGE } from '@/lib/constants';

interface CartSummaryProps {
  showSurcharge?: boolean;
  paymentMethod?: 'bank_transfer' | 'credit_card';
}

export default function CartSummary({ showSurcharge, paymentMethod }: CartSummaryProps) {
  const { subtotal } = useCart();
  const surcharge = paymentMethod === 'credit_card' ? subtotal * CREDIT_CARD_SURCHARGE : 0;
  const total = subtotal + surcharge;

  return (
    <div className="bg-cream rounded-2xl p-6">
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
    </div>
  );
}
