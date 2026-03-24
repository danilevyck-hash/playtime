'use client';

import Image from 'next/image';
import { Product } from '@/lib/types';
import { CATEGORY_ICONS } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import Button from '@/components/ui/Button';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem, items } = useCart();
  const inCart = items.find((i) => i.productId === product.id);

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow flex flex-col">
      {/* Image */}
      <div className="relative aspect-[4/3] bg-gray-100">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple/5 to-purple/10">
            <span className="text-5xl">{CATEGORY_ICONS[product.category]}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-heading font-bold text-base text-gray-800 mb-1 line-clamp-2">
          {product.name}
        </h3>
        <p className="font-body text-sm text-gray-400 leading-relaxed mb-3 line-clamp-2">
          {product.description}
        </p>
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
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
                })
              }
            >
              {inCart ? '+' : 'Agregar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
