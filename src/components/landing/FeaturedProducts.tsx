'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Product } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import { CATEGORIES, CONTACT } from '@/lib/constants';
import { CATEGORY_DOODLES } from '@/components/ui/CategoryDoodles';
import Button from '@/components/ui/Button';
import ProductModal from '@/components/catalog/ProductModal';

interface FeaturedProps {
  content?: { featured_title?: string; featured_subtitle?: string };
  /** Resolved server-side (page.tsx) so this section renders without a client fetch. */
  featured: Product[];
}

export default function FeaturedProducts({ content, featured }: FeaturedProps) {
  const { addItem } = useCart();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  return (
    <section className="bg-white py-10 md:py-14">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-3">
            <span className="md:hidden">{content?.featured_title ? content.featured_title : 'Lo m\u00e1s pedido'}</span>
            <span className="hidden md:inline">{content?.featured_title || 'Lo m\u00e1s pedido para eventos este a\u00f1o'}</span>
          </h2>
          <p className="font-body text-gray-500 max-w-md mx-auto">
            {content?.featured_subtitle || 'Los favoritos de nuestros clientes'}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
          {featured.map((product, index) => (
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
                    priority={index < 2}
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 33vw"
                  />
                ) : (() => {
                  const Doodle = CATEGORY_DOODLES[product.category];
                  const catInfo = CATEGORIES.find(c => c.id === product.category);
                  return (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-teal/10 to-purple/10">
                      {Doodle ? <Doodle className="w-16 h-16 opacity-60" /> : <span className="text-5xl">{catInfo?.icon || ''}</span>}
                    </div>
                  );
                })()}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur rounded-full px-4 py-2 font-heading font-semibold text-sm text-purple shadow-lg">
                    Ver detalles
                  </span>
                </div>
              </button>

              {/* Content */}
              <div className="p-3 sm:p-5 flex flex-col flex-1">
                <div className="text-[10px] sm:text-xs font-heading font-semibold text-teal uppercase tracking-wider mb-1 sm:mb-2">
                  {CATEGORIES.find(c => c.id === product.category)?.label || product.category}
                </div>
                <h3
                  className="font-heading font-bold text-sm sm:text-lg text-gray-800 mb-0.5 sm:mb-1 line-clamp-2 cursor-pointer hover:text-purple transition-colors leading-tight"
                  onClick={() => setSelectedProduct(product)}
                >
                  {product.name}
                </h3>
                <p className="font-body font-normal text-xs sm:text-sm text-gray-600 mb-2 sm:mb-4 leading-relaxed line-clamp-2">
                  {product.description}
                </p>
                <div className="flex items-center justify-between mt-auto pt-2 sm:pt-4 border-t border-gray-200 gap-1 sm:gap-2 overflow-hidden">
                  {product.price === 0 ? (
                    <span className="inline-block bg-gray-100 text-gray-500 font-heading font-semibold text-[10px] sm:text-xs px-2 sm:px-3 py-1 rounded-full whitespace-nowrap">Consultar</span>
                  ) : (
                    <span className="font-heading font-bold text-base sm:text-2xl text-purple whitespace-nowrap">
                      {formatCurrency(product.price)}
                    </span>
                  )}
                  {product.price === 0 ? (
                    <a href={`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(`Hola! Me interesa ${product.name}`)}`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline">Preguntar</Button>
                    </a>
                  ) : (
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
                      className="bg-orange text-white font-heading font-bold text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full hover:bg-orange/90 transition-colors whitespace-nowrap shrink-0"
                    >
                      + Agregar
                    </button>
                  )}
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
