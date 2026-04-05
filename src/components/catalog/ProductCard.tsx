'use client';

import { memo } from 'react';
import Image from 'next/image';
import { Product } from '@/lib/types';
import { CATEGORY_ICONS } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import { CONTACT } from '@/lib/constants';
import Button from '@/components/ui/Button';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

export default memo(function ProductCard({ product, onSelect }: ProductCardProps) {
  const { addItem, items } = useCart();
  const inCart = items.find((i) => i.productId === product.id);

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow flex flex-col">
      {/* Image - clickable to open modal */}
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
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple/5 to-purple/10">
            <span className="text-5xl">{CATEGORY_ICONS[product.category]}</span>
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur rounded-full px-4 py-2 font-heading font-semibold text-sm text-purple shadow-lg">
            Ver m&aacute;s &#10024;
          </span>
        </div>
      </button>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <h3
          className="font-heading font-bold text-base text-gray-800 mb-1 line-clamp-2 cursor-pointer hover:text-purple transition-colors"
          onClick={() => onSelect(product)}
        >
          {product.name}
        </h3>
        <p className="font-body text-sm text-gray-400 leading-relaxed mb-3 line-clamp-2">
          {product.description}
        </p>
        <div className="mt-auto pt-3 border-t border-gray-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-heading font-bold text-lg text-purple">
              {formatCurrency(product.price)}
            </span>
            <div className="flex items-center gap-2">
              {inCart && (
                <span className="text-xs font-heading font-semibold text-teal bg-teal/10 px-2 py-1 rounded-full">
                  x{inCart.quantity}
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
                {inCart ? '+' : '\u00a1Lo quiero!'}
              </Button>
            </div>
          </div>
          <a
            href={`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(`Hola! Me interesa el servicio de ${product.name}. \u00bfMe pueden dar m\u00e1s informaci\u00f3n?`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-teal font-heading font-semibold text-xs hover:text-teal/80 transition-colors py-0.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Consultar por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
});
