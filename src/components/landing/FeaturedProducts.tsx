'use client';

import { PRODUCTS } from '@/lib/constants';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import Button from '@/components/ui/Button';

export default function FeaturedProducts() {
  const { addItem } = useCart();
  const featured = PRODUCTS.filter((p) => p.featured).slice(0, 6);

  return (
    <section className="bg-white py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-3">
            Los Más Populares
          </h2>
          <p className="font-body text-gray-500 max-w-md mx-auto">
            Los favoritos de nuestros clientes
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((product) => (
            <div
              key={product.id}
              className="bg-cream rounded-2xl p-6 flex flex-col border border-gray-100 hover:shadow-lg transition-shadow"
            >
              <div className="flex-1">
                <div className="text-xs font-heading font-semibold text-teal uppercase tracking-wider mb-2">
                  {product.category === 'planes' ? 'Plan' : product.category}
                </div>
                <h3 className="font-heading font-bold text-xl text-gray-800 mb-2">
                  {product.name}
                </h3>
                <p className="font-body text-sm text-gray-500 mb-4 leading-relaxed">
                  {product.description}
                </p>
              </div>
              <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-200">
                <span className="font-heading font-bold text-2xl text-purple">
                  {formatCurrency(product.price)}
                </span>
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
                  Agregar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
