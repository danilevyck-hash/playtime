'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Product, ProductVariant } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import Button from '@/components/ui/Button';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  extraImages?: string[];
}

export default function ProductModal({ product, onClose, extraImages }: ProductModalProps) {
  const { addItem, items } = useCart();
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  // Build images array: main image + extra images (filtered to non-empty)
  const allImages = product ? [
    product.image || '',
    ...(extraImages || []).slice(1), // skip index 0 since main image is already included
  ].filter(Boolean) : [];

  useEffect(() => {
    setActiveIndex(0);
    setSelectedVariant(null);
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && allImages.length > 1) setActiveIndex(prev => prev > 0 ? prev - 1 : allImages.length - 1);
      if (e.key === 'ArrowRight' && allImages.length > 1) setActiveIndex(prev => prev < allImages.length - 1 ? prev + 1 : 0);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, onClose, allImages.length]);

  if (!product) return null;

  const hasVariants = product.variants && product.variants.length > 0;
  const activePrice = selectedVariant?.price ?? product.price;
  const cartId = hasVariants && selectedVariant ? `${product.id}--${selectedVariant.id}` : product.id;
  const cartName = hasVariants && selectedVariant ? `${product.name} — ${selectedVariant.label}` : product.name;
  const inCart = items.find((i) => i.productId === cartId);
  const needsVariant = hasVariants && !selectedVariant;
  const currentImage = allImages[activeIndex] || '';
  const hasMultiple = allImages.length > 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white rounded-3xl overflow-hidden max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg hover:bg-white"
          aria-label="Cerrar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Image with carousel — hidden if no images */}
        {allImages.length > 0 ? (
        <div className="relative aspect-[16/9] bg-gray-100">
          <Image
            src={currentImage}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 640px"
            priority
          />

          {/* Navigation arrows */}
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
            </>
          )}

          {/* Dots */}
          {hasMultiple && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {allImages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  className={`w-2 h-2 rounded-full ${i === activeIndex ? 'bg-white w-4' : 'bg-white/60'}`}
                />
              ))}
            </div>
          )}
        </div>
        ) : null}

        {/* Content */}
        <div className="p-6 md:p-8">
          <div className="text-xs font-heading font-semibold text-teal uppercase tracking-wider mb-2">
            {product.category}
          </div>
          <h2 className="font-heading font-bold text-2xl md:text-3xl text-gray-800 mb-3">
            {product.name}
          </h2>
          <p className="font-body text-gray-500 leading-relaxed mb-6">
            {product.description}
          </p>

          {/* Variant selector */}
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
            </div>
          )}

          <div className="sticky bottom-0 bg-white border-t border-gray-100 -mx-6 md:-mx-8 px-6 md:px-8 py-4 flex items-center justify-between">
            <div>
              <span className="font-heading font-bold text-2xl text-purple">{formatCurrency(activePrice)}</span>
              {inCart && <span className="text-xs font-heading font-semibold text-teal ml-2">{inCart.quantity} en carrito</span>}
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
                    });
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
