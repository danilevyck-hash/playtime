'use client';

import { memo, useState, useRef } from 'react';
import Image from 'next/image';
import { Product } from '@/lib/types';
import { CATEGORY_ICONS } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import { useFavorites } from '@/lib/useFavorites';


interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
}

export default memo(function ProductCard({ product, onSelect, index = 0 }: ProductCardProps & { index?: number }) {
  const { addItem, items } = useCart();
  const { toggle, isFavorite } = useFavorites();
  const [loaded, setLoaded] = useState(false);

  const prevImageRef = useRef(product.image);
  if (prevImageRef.current !== product.image) {
    prevImageRef.current = product.image;
    setLoaded(false);
  }

  const inCart = items.find((i) => i.productId === product.id);
  const fav = isFavorite(product.id);
  const hasVariants = !!(product.variants && product.variants.length > 0);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (hasVariants) {
      onSelect(product);
    } else {
      addItem({
        productId: product.id,
        name: product.name,
        category: product.category,
        unitPrice: product.price,
        image: product.image,
      });
    }
  };

  return (
    <div
      className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex flex-col animate-slide-up"
      style={{ animationDelay: `${Math.min(index * 50, 400)}ms`, animationFillMode: 'both' }}
    >
      {/* Image area: siblings, not nested buttons (nested interactive = invalid HTML) */}
      <div className="relative aspect-[4/3] bg-gray-100 group overflow-hidden">
        {product.image ? (
          <>
            <div className={`absolute inset-0 bg-gray-100 ${loaded ? '' : 'animate-pulse'}`} />
            <Image
              key={`${product.id}-${product.image}`}
              src={product.image}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className={`object-cover group-hover:scale-105 transition-all duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLoaded(true)}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple/5 to-teal/10" aria-hidden="true">
            <span className="text-3xl">{CATEGORY_ICONS[product.category]}</span>
          </div>
        )}

        {/* Main select button — covers the image, sits UNDER the corner buttons */}
        <button
          type="button"
          onClick={() => onSelect(product)}
          className="absolute inset-0 z-[1] cursor-pointer"
          aria-label={`Ver ${product.name}`}
        />

        {/* Favorito — botón hermano, área táctil 44px, aria-pressed */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggle(product.id); }}
          aria-pressed={fav}
          aria-label={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          className="absolute top-0 left-0 z-[2] w-11 h-11 flex items-center justify-center"
        >
          <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-3 h-3" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" stroke={fav ? '#EF4444' : '#9CA3AF'} fill={fav ? '#EF4444' : 'none'} strokeWidth={2} />
            </svg>
          </span>
        </button>

        {product.popular && (
          <span className="absolute bottom-2 left-2 text-[10px] font-heading font-bold text-white bg-orange px-2 py-0.5 rounded-full shadow-sm z-[1]">
            Popular
          </span>
        )}
        {inCart && (
          <span className="absolute top-2 right-2 text-[10px] font-heading font-bold text-white bg-teal px-1.5 py-0.5 rounded-full z-[1]">
            x{inCart.quantity}
          </span>
        )}

        {/* Botón "+" — hermano, área táctil 44px */}
        <button
          type="button"
          onClick={handleAdd}
          className="absolute bottom-0 right-0 z-[2] w-11 h-11 flex items-center justify-center active:scale-90 transition-transform"
          aria-label={hasVariants ? `Ver opciones de ${product.name}` : `Agregar ${product.name} al carrito`}
        >
          <span
            className="flex items-center justify-center text-white"
            style={{ width: 26, height: 26, borderRadius: '50%', backgroundColor: '#C2410C', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </span>
        </button>
      </div>

      <div className="p-2 sm:p-3 flex flex-col flex-1">
        <h3
          className="font-heading font-bold text-xs sm:text-sm text-gray-800 line-clamp-2 cursor-pointer hover:text-purple transition-colors leading-tight"
          onClick={() => onSelect(product)}
          title={product.name}
        >
          {product.name}
        </h3>
        <div className="mt-auto pt-1.5">
          <span className="font-heading font-bold text-sm sm:text-base text-purple">
            {formatCurrency(product.price)}
          </span>
        </div>
      </div>
    </div>
  );
});
