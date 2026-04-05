'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Product, CATEGORY_ICONS } from '@/lib/types';
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

  // Build images array: main image + extra images (filtered to non-empty)
  const allImages = product ? [
    product.image || '',
    ...(extraImages || []).slice(1), // skip index 0 since main image is already included
  ].filter(Boolean) : [];

  useEffect(() => {
    setActiveIndex(0);
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

  const inCart = items.find((i) => i.productId === product.id);
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
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
          aria-label="Cerrar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Image with carousel */}
        <div className="relative aspect-[4/3] bg-gray-100">
          {currentImage ? (
            <Image
              src={currentImage}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 640px"
              priority
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple/5 to-purple/10">
              <span className="text-8xl">{CATEGORY_ICONS[product.category]}</span>
            </div>
          )}

          {/* Navigation arrows */}
          {hasMultiple && (
            <>
              <button
                onClick={() => setActiveIndex(prev => prev > 0 ? prev - 1 : allImages.length - 1)}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 backdrop-blur rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors"
              >
                <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button
                onClick={() => setActiveIndex(prev => prev < allImages.length - 1 ? prev + 1 : 0)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 backdrop-blur rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors"
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
                  className={`w-2 h-2 rounded-full transition-all ${i === activeIndex ? 'bg-white w-4' : 'bg-white/60'}`}
                />
              ))}
            </div>
          )}
        </div>

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

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="font-heading font-bold text-3xl text-purple">
              {formatCurrency(product.price)}
            </span>
            <div className="flex items-center gap-3">
              {inCart && (
                <span className="text-sm font-heading font-semibold text-teal bg-teal/10 px-3 py-1.5 rounded-full">
                  {inCart.quantity} en carrito
                </span>
              )}
              <Button
                onClick={() => {
                  addItem({
                    productId: product.id,
                    name: product.name,
                    category: product.category,
                    unitPrice: product.price,
                    image: product.image,
                  });
                }}
              >
                {inCart ? 'Agregar otro' : 'Agregar al carrito'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
