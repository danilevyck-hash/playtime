'use client';

import { Product } from '@/lib/types';
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
    <div className="bg-white rounded-2xl p-5 flex flex-col border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex-1">
        <h3 className="font-heading font-bold text-lg text-gray-800 mb-1.5">
          {product.name}
        </h3>
        <p className="font-body text-sm text-gray-500 leading-relaxed mb-4">
          {product.description}
        </p>
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <span className="font-heading font-bold text-xl text-purple">
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
  );
}
