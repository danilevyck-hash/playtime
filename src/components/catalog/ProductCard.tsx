'use client';

import { memo } from 'react';
import Image from 'next/image';
import { Product } from '@/lib/types';
import { CATEGORY_ICONS } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import { CATEGORIES } from '@/lib/constants';
import Button from '@/components/ui/Button';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

export default memo(function ProductCard({ product, onSelect }: ProductCardProps) {
  const { addItem, items } = useCart();
  const inCart = items.find((i) => i.productId === product.id);
  const isConsultar = product.price === 0;
  const catLabel = CATEGORIES.find(c => c.id === product.category)?.label || product.category;

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition-shadow flex flex-col">
      {/* Image - clickable to open modal */}
      <button
        onClick={() => onSelect(product)}
        className="relative aspect-square bg-gray-100 cursor-pointer group"
      >
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple/5 to-teal/10">
            <span className="text-4xl">{CATEGORY_ICONS[product.category]}</span>
          </div>
        )}
        {inCart && (
          <span className="absolute top-2 right-2 text-xs font-heading font-bold text-white bg-teal px-2 py-0.5 rounded-full">
            x{inCart.quantity}
          </span>
        )}
      </button>

      {/* Content */}
      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <h3
          className="font-heading font-bold text-sm sm:text-base text-gray-800 mb-0.5 line-clamp-2 cursor-pointer hover:text-purple transition-colors"
          onClick={() => onSelect(product)}
          title={product.name}
        >
          {product.name}
        </h3>
        <span className="text-[10px] uppercase tracking-wide text-gray-400 font-heading mb-2">{catLabel}</span>
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
          {isConsultar ? (
            <span className="font-heading font-semibold text-sm text-gray-400 italic">Consultar</span>
          ) : (
            <span className="font-heading font-bold text-lg text-purple">
              {formatCurrency(product.price)}
            </span>
          )}
          <Button
            size="sm"
            onClick={() =>
              addItem({
                productId: product.id,
                name: product.name,
                category: product.category,
                unitPrice: product.price,
                image: product.image,
              })
            }
          >
            {isConsultar ? 'Consultar' : inCart ? '+' : '\u00a1Lo quiero!'}
          </Button>
        </div>
      </div>
    </div>
  );
});
