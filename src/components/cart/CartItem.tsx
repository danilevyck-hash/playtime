'use client';

import Image from 'next/image';
import { CartItem as CartItemType, CATEGORY_ICONS } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';

interface CartItemProps {
  item: CartItemType;
}

export default function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCart();

  return (
    <div className="flex items-center gap-3 py-4 border-b border-gray-100">
      {/* Product image */}
      <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
        {item.image ? (
          <Image src={item.image} alt={item.name} width={80} height={80} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl md:text-3xl">
            {CATEGORY_ICONS[item.category] || '\uD83C\uDF88'}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-heading font-semibold text-gray-800 truncate">{item.name.includes(' — ') ? item.name.split(' — ')[0] : item.name}</h3>
        {item.name.includes(' — ') && (
          <span className="inline-block text-[10px] font-heading font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mt-0.5">{item.name.split(' — ')[1]}</span>
        )}
        <p className="text-sm font-body font-normal text-gray-500">{formatCurrency(item.unitPrice)} c/u</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (item.quantity === 1) {
              if (window.confirm(`\u00bfEliminar "${item.name}" del carrito?`)) removeItem(item.productId);
            } else {
              updateQuantity(item.productId, item.quantity - 1);
            }
          }}
          className="min-w-[44px] min-h-[44px] rounded-full bg-gray-100 flex items-center justify-center font-heading font-bold text-lg text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors"
          aria-label={`Disminuir cantidad de ${item.name}`}
        >
          -
        </button>
        <span className="w-8 text-center font-heading font-semibold text-gray-800">{item.quantity}</span>
        <button
          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
          className="min-w-[44px] min-h-[44px] rounded-full bg-gray-100 flex items-center justify-center font-heading font-bold text-lg text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors"
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
        className="p-2 text-gray-400 hover:text-pink transition-colors"
        aria-label={`Eliminar ${item.name}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
