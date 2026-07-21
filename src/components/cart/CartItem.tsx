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
  const stepQty = Math.max(1, item.quantityStep || 1);
  const minQty = Math.max(1, item.minQuantity || 1);

  return (
    <div className="bg-white rounded-xl px-3 py-3">
      {/* Row 1: Image + Name + Delete */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
          {item.image ? (
            <Image src={item.image} alt={item.name} width={56} height={56} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">
              {CATEGORY_ICONS[item.category] || '\uD83C\uDF88'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-semibold text-sm text-gray-800 leading-tight">{item.name.includes(' — ') ? item.name.split(' — ')[0] : item.name}</h3>
          {item.name.includes(' — ') && (
            <span className="inline-block text-xs font-heading font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mt-0.5">{item.name.split(' — ')[1]}</span>
          )}
          <p className="text-xs font-body text-gray-500 mt-0.5">{formatCurrency(item.unitPrice)} c/u</p>
        </div>
        <button
          onClick={() => removeItem(item.productId)}
          className="p-2 text-gray-400 hover:text-pink transition-colors flex-shrink-0"
          aria-label={`Eliminar ${item.name}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
      {/* Row 2: Stepper + Total */}
      <div className="flex items-center justify-between pl-[68px]">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              const next = item.quantity - stepQty;
              if (next < minQty) {
                if (window.confirm(`\u00bfEliminar "${item.name}" del carrito?`)) removeItem(item.productId);
              } else {
                updateQuantity(item.productId, next);
              }
            }}
            className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center font-heading font-bold text-base text-gray-600 active:bg-gray-200 transition-colors"
            aria-label={`Disminuir cantidad de ${item.name}`}
          >
            -
          </button>
          <span aria-live="polite" aria-atomic="true" className="w-8 text-center font-heading font-semibold text-gray-800">{item.quantity}</span>
          <button
            onClick={() => updateQuantity(item.productId, item.quantity + stepQty)}
            className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center font-heading font-bold text-base text-gray-600 active:bg-gray-200 transition-colors"
            aria-label={`Aumentar cantidad de ${item.name}`}
          >
            +
          </button>
        </div>
        <p className="font-heading font-bold text-gray-800">{formatCurrency(item.unitPrice * item.quantity)}</p>
      </div>
      {stepQty > 1 && (
        <p className="text-xs font-body text-orange-text pl-[68px] mt-1">Se vende de {stepQty} en {stepQty}</p>
      )}
    </div>
  );
}
