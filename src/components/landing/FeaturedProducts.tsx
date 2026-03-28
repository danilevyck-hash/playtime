'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useProducts } from '@/lib/useProducts';
import { CATEGORY_ICONS, Product } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import { CATEGORIES } from '@/lib/constants';
import Button from '@/components/ui/Button';
import ProductModal from '@/components/catalog/ProductModal';

interface FeaturedProps {
  content?: { featured_title?: string; featured_subtitle?: string };
  featuredIds?: string[];
}

export default function FeaturedProducts({ content, featuredIds }: FeaturedProps) {
  const { addItem } = useCart();
  const products = useProducts();
  const featured = featuredIds && featuredIds.length > 0
    ? featuredIds.map(id => products.find(p => p.id === id)).filter((p): p is Product => !!p).slice(0, 6)
    : products.filter((p) => p.featured).slice(0, 6);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  return (
    <section className="bg-white py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-3">
            {content?.featured_title || 'Los M\u00e1s Populares'}
          </h2>
          <p className="font-body text-gray-500 max-w-md mx-auto">
            {content?.featured_subtitle || 'Los favoritos de nuestros clientes'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((product) => (
            <div
              key={product.id}
              className="bg-cream rounded-2xl overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow flex flex-col"
            >
              {/* Image - clickable */}
              <button
                onClick={() => setSelectedProduct(product)}
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
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur rounded-full px-4 py-2 font-heading font-semibold text-sm text-purple shadow-lg">
                    Ver detalles
                  </span>
                </div>
              </button>

              {/* Content */}
              <div className="p-5 flex flex-col flex-1">
                <div className="text-xs font-heading font-semibold text-teal uppercase tracking-wider mb-2">
                  {CATEGORIES.find(c => c.id === product.category)?.label || product.category}
                </div>
                <h3
                  className="font-heading font-bold text-lg text-gray-800 mb-1 line-clamp-2 cursor-pointer hover:text-purple transition-colors"
                  onClick={() => setSelectedProduct(product)}
                >
                  {product.name}
                </h3>
                <p className="font-body text-sm text-gray-400 mb-4 leading-relaxed line-clamp-2">
                  {product.description}
                </p>
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
                    {'\u00a1'}Lo quiero! {'\uD83C\uDF89'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </section>
  );
}
