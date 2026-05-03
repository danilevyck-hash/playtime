'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Product, ProductVariant } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import { useFavorites } from '@/lib/useFavorites';
import Button from '@/components/ui/Button';

interface Props {
  product: Product;
  gallery: string[];
}

export default function ProductDetailClient({ product, gallery }: Props) {
  const { addItem, items } = useCart();
  const { toggle: toggleFav, isFavorite } = useFavorites();
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  const allImages = [
    product.image || '',
    ...gallery.slice(1),
  ].filter(Boolean);

  const minQty = Math.max(1, product.minQuantity || 1);
  const stepQty = Math.max(1, product.quantityStep || 1);
  const [quantity, setQuantity] = useState(minQty);

  const hasVariants = !!(product.variants && product.variants.length > 0);
  const activePrice = selectedVariant?.price ?? product.price;
  const cartId = hasVariants && selectedVariant ? `${product.id}--${selectedVariant.id}` : product.id;
  const cartName = hasVariants && selectedVariant ? `${product.name} — ${selectedVariant.label}` : product.name;
  const inCart = items.find((i) => i.productId === cartId);
  const needsVariant = hasVariants && !selectedVariant;
  const variantImage = selectedVariant?.image;
  const currentImage = variantImage || allImages[activeIndex] || '';
  const hasMultiple = !variantImage && allImages.length > 1;
  const fav = isFavorite(product.id);

  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
      {allImages.length > 0 && (
        <div className="relative aspect-[4/3] sm:aspect-[16/9] bg-gray-100">
          <Image
            src={currentImage}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 800px"
            priority
          />
          {hasMultiple && (
            <>
              <button
                onClick={() => setActiveIndex(prev => prev > 0 ? prev - 1 : allImages.length - 1)}
                aria-label="Imagen anterior"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 backdrop-blur rounded-full flex items-center justify-center shadow-md hover:bg-white"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button
                onClick={() => setActiveIndex(prev => prev < allImages.length - 1 ? prev + 1 : 0)}
                aria-label="Imagen siguiente"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 backdrop-blur rounded-full flex items-center justify-center shadow-md hover:bg-white"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {allImages.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveIndex(i)}
                    className={`w-2 h-2 rounded-full ${i === activeIndex ? 'bg-white w-4' : 'bg-white/60'}`}
                    aria-label={`Ir a imagen ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
          <button
            onClick={() => toggleFav(product.id)}
            className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg hover:bg-white"
            aria-label={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" stroke={fav ? '#F27289' : '#6b7280'} fill={fav ? '#F27289' : 'none'} strokeWidth={2} />
            </svg>
          </button>
        </div>
      )}

      <div className="p-6 md:p-8">
        <div className="text-xs font-heading font-semibold text-teal uppercase tracking-wider mb-2">
          {product.category}
        </div>
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-gray-800 mb-3">
          {product.name}
        </h1>
        <p className="font-body text-gray-500 leading-relaxed mb-6">
          {product.description}
        </p>

        {(stepQty > 1 || minQty > 1) && (
          <div className="mb-4 bg-orange/10 border border-orange/20 rounded-xl px-4 py-2.5">
            <p className="font-heading font-semibold text-xs text-orange">
              {stepQty > 1 && minQty > 1
                ? `Se vende en paquetes de ${stepQty} (mínimo ${minQty})`
                : stepQty > 1
                ? `Se agregan de ${stepQty} en ${stepQty}`
                : `Mínimo ${minQty} unidades`}
            </p>
          </div>
        )}

        {hasVariants && (
          <div className="mb-6">
            <p className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2.5">{product.variantLabel}</p>
            <div className="flex flex-wrap gap-2">
              {product.variants!.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariant(selectedVariant?.id === v.id ? null : v)}
                  className={`px-4 py-2 rounded-full text-sm font-heading font-semibold ${
                    selectedVariant?.id === v.id
                      ? 'bg-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {v.label}{v.price !== undefined ? ` · ${formatCurrency(v.price)}` : ''}
                </button>
              ))}
            </div>
            {selectedVariant?.description && (
              <p className="text-sm text-gray-400 mt-1.5 font-body leading-snug">{selectedVariant.description}</p>
            )}
          </div>
        )}

        <div className="sticky bottom-0 bg-white border-t border-gray-100 -mx-6 md:-mx-8 px-6 md:px-8 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="shrink-0">
            <span className="font-heading font-bold text-2xl text-purple">{formatCurrency(activePrice)}</span>
            {inCart && <span className="text-xs font-heading font-semibold text-teal ml-2">{inCart.quantity} en carrito</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-gray-100 rounded-full">
              <button
                onClick={() => setQuantity(q => Math.max(minQty, q - stepQty))}
                className="min-h-[44px] w-10 flex items-center justify-center rounded-l-full text-lg font-heading font-bold text-gray-500 hover:text-purple transition-colors disabled:opacity-30"
                disabled={quantity <= minQty}
                aria-label="Reducir cantidad"
              >
                −
              </button>
              <span className="min-w-[28px] text-center font-heading font-bold text-base text-purple select-none">{quantity}</span>
              <button
                onClick={() => setQuantity(q => q + stepQty)}
                className="min-h-[44px] w-10 flex items-center justify-center rounded-r-full text-lg font-heading font-bold text-gray-500 hover:text-purple transition-colors disabled:opacity-30"
                disabled={product.maxQuantity !== undefined && product.maxQuantity !== null && quantity + stepQty > product.maxQuantity}
                aria-label="Aumentar cantidad"
              >
                +
              </button>
            </div>
            {needsVariant ? (
              <Button disabled>
                Selecciona {product.variantLabel?.toLowerCase()}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  addItem({
                    productId: cartId,
                    name: cartName,
                    category: product.category,
                    unitPrice: activePrice,
                    image: product.image,
                    quantity,
                    maxQuantity: product.maxQuantity,
                    minQuantity: product.minQuantity,
                    quantityStep: product.quantityStep,
                  });
                  setQuantity(minQty);
                }}
              >
                {inCart ? 'Agregar otro' : 'Agregar al carrito'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
