'use client';

import { memo } from 'react';
import Image from 'next/image';
import { Product } from '@/lib/types';
import { CATEGORY_ICONS } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import { CONTACT } from '@/lib/constants';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

export default memo(function ProductCard({ product, onSelect, index = 0 }: ProductCardProps & { index?: number }) {
  const { addItem, items } = useCart();
  const inCart = items.find((i) => i.productId === product.id);
  const isConsultar = product.price === 0;

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition-all active:scale-[0.98] flex flex-col animate-slide-up" style={{ animationDelay: `${Math.min(index * 50, 400)}ms`, animationFillMode: 'both' }}>
      <button
        onClick={() => onSelect(product)}
        className="relative aspect-[4/3] bg-gray-100 cursor-pointer group"
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
            <span className="text-3xl">{CATEGORY_ICONS[product.category]}</span>
          </div>
        )}
        {inCart && (
          <span className="absolute top-1.5 right-1.5 text-[10px] font-heading font-bold text-white bg-teal px-1.5 py-0.5 rounded-full">
            x{inCart.quantity}
          </span>
        )}
      </button>
      <div className="p-2 sm:p-3 flex flex-col flex-1">
        <h3
          className="font-heading font-bold text-xs sm:text-sm text-gray-800 line-clamp-2 cursor-pointer hover:text-purple transition-colors leading-tight"
          onClick={() => onSelect(product)}
          title={product.name}
        >
          {product.name}
        </h3>
        <div className="flex items-center justify-between mt-auto pt-1.5">
          {isConsultar ? (
            <a
              href={`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(`Hola! Me interesa ${product.name}. ¿Me pueden dar más información?`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-heading font-semibold text-xs text-teal hover:text-teal/80"
            >
              Consultar
            </a>
          ) : (
            <>
              <span className="font-heading font-bold text-sm sm:text-base text-purple">
                {formatCurrency(product.price)}
              </span>
              <button
                onClick={() =>
                  addItem({
                    productId: product.id,
                    name: product.name,
                    category: product.category,
                    unitPrice: product.price,
                    image: product.image,
                  })
                }
                className="w-8 h-8 rounded-full bg-orange text-white flex items-center justify-center text-lg font-bold hover:bg-orange/90 transition-colors shrink-0"
              >
                +
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
