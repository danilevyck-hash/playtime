'use client';

import { CartItem as CartItemType } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';

interface CartItemProps {
  item: CartItemType;
}

export default function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCart();

  return (
    <div className="flex items-center gap-4 py-4 border-b border-gray-100">
      <div className="flex-1 min-w-0">
        <h3 className="font-heading font-semibold text-gray-800 truncate">{item.name}</h3>
        <p className="text-sm font-body text-gray-400">{formatCurrency(item.unitPrice)} c/u</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-heading font-bold text-gray-600 hover:bg-gray-200 transition-colors"
          aria-label={`Disminuir cantidad de ${item.name}`}
        >
          -
        </button>
        <span className="w-8 text-center font-heading font-semibold text-gray-800">{item.quantity}</span>
        <button
          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-heading font-bold text-gray-600 hover:bg-gray-200 transition-colors"
          aria-label={`Aumentar cantidad de ${item.name}`}
        >
          +
        </button>
      </div>

      <div className="text-right w-20">
        <p className="font-heading font-bold text-gray-800">{formatCurrency(item.unitPrice * item.quantity)}</p>
      </div>

      <button
        onClick={() => removeItem(item.productId)}
        className="p-1 text-gray-400 hover:text-pink transition-colors"
        aria-label={`Eliminar ${item.name}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
