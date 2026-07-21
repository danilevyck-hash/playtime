'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Product, ProductVariant } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import { useFavorites } from '@/lib/useFavorites';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import Button from '@/components/ui/Button';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  extraImages?: string[];
  variantImages?: Record<string, string>;  // kept for backward compat, prefer variant.image
}

export default function ProductModal({ product, onClose, extraImages, variantImages }: ProductModalProps) {
  const { addItem, items } = useCart();
  const { toggle: toggleFav, isFavorite } = useFavorites();
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [copied, setCopied] = useState(false);
  // Dialog element ref: traps focus, Escape closes, restores focus on close.
  const sheetRef = useFocusTrap<HTMLDivElement>(!!product, onClose);
  const dragStartY = useRef<number | null>(null);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) {
      isDragging.current = true;
      setDragDeltaY(delta);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragDeltaY > 100) {
      onClose();
    }
    setDragDeltaY(0);
    dragStartY.current = null;
    isDragging.current = false;
  }, [dragDeltaY, onClose]);

  // Build images array: main image + extra images (filtered to non-empty)
  const allImages = product ? [
    product.image || '',
    ...(extraImages || []).slice(1), // skip index 0 since main image is already included
  ].filter(Boolean) : [];

  const minQty = Math.max(1, product?.minQuantity || 1);
  const stepQty = 1;
  const [quantity, setQuantity] = useState(minQty);

  useEffect(() => {
    setActiveIndex(0);
    setSelectedVariant(null);
    setQuantity(Math.max(1, product?.minQuantity || 1));
  }, [product]);

  useEffect(() => {
    if (!product) return;
    // Escape + focus trap are handled by useFocusTrap; here we only add the
    // image carousel arrow keys.
    const handleEsc = (e: KeyboardEvent) => {
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
  const variantImage = selectedVariant?.image || (selectedVariant && variantImages?.[selectedVariant.id]);
  const currentImage = variantImage || allImages[activeIndex] || '';
  const hasMultiple = !variantImage && allImages.length > 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        className="relative bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-sheet-up sm:animate-modal-in"
        style={dragDeltaY > 0 ? { transform: `translateY(${dragDeltaY}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile only) */}
        <div
          className="sm:hidden flex justify-center pt-3 pb-1"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Favorite button */}
        <button
          onClick={() => product && toggleFav(product.id)}
          className="absolute top-4 right-16 z-10 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg hover:bg-white"
          aria-label={product && isFavorite(product.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" stroke={product && isFavorite(product.id) ? '#F27289' : '#6b7280'} fill={product && isFavorite(product.id) ? '#F27289' : 'none'} strokeWidth={2} />
          </svg>
        </button>

        {/* Share button */}
        <button
          onClick={() => {
            if (!product) return;
            const shareUrl = `${window.location.origin}/catalogo/${product.id}`;
            if (typeof navigator !== 'undefined' && navigator.share) {
              navigator.share({
                title: product.name,
                text: `Mira este servicio de PlayTime: ${product.name}`,
                url: shareUrl,
              }).catch(() => {});
            } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(shareUrl).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }).catch(() => {});
            }
          }}
          className="absolute top-4 right-28 z-10 h-10 px-3 min-w-[40px] bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all"
          aria-label="Compartir"
        >
          {copied ? (
            <span className="text-xs font-heading font-bold text-purple whitespace-nowrap">{'¡'}Link copiado!</span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l-4-4-4 4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12" />
            </svg>
          )}
        </button>

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
        <div className="relative aspect-[4/3] sm:aspect-[16/9] bg-gray-100">
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
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex">
              {allImages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Ir a imagen ${i + 1} de ${allImages.length}`}
                  aria-current={i === activeIndex ? 'true' : undefined}
                  className="p-2 flex items-center"
                >
                  <span aria-hidden="true" className={`block h-2 rounded-full transition-all ${i === activeIndex ? 'bg-white w-4' : 'bg-white/60 w-2'}`} />
                </button>
              ))}
            </div>
          )}
        </div>
        ) : null}

        {/* Content */}
        <div className="p-6 md:p-8">
          <div className="text-xs font-heading font-semibold text-teal-text uppercase tracking-wider mb-2">
            {product.category}
          </div>
          <h2 id="product-modal-title" className="font-heading font-bold text-2xl md:text-3xl text-gray-800 mb-3">
            {product.name}
          </h2>
          <p className="font-body text-gray-500 leading-relaxed mb-6">
            {product.description}
          </p>

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

          <div className="sticky bottom-0 bg-white border-t border-gray-100 -mx-6 md:-mx-8 px-6 md:px-8 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
            <div className="shrink-0">
              <span className="font-heading font-bold text-2xl text-purple">{formatCurrency(activePrice)}</span>
              {inCart && <span className="text-xs font-heading font-semibold text-teal-text ml-2">{inCart.quantity} en carrito</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Quantity stepper */}
              <div className="flex items-center bg-gray-100 rounded-full">
                <button
                  onClick={() => setQuantity(q => Math.max(minQty, q - stepQty))}
                  className="min-h-[44px] w-10 flex items-center justify-center rounded-l-full text-lg font-heading font-bold text-gray-500 hover:text-purple transition-colors disabled:opacity-30"
                  disabled={quantity <= minQty}
                  aria-label="Reducir cantidad"
                >
                  −
                </button>
                <span aria-live="polite" aria-atomic="true" className="min-w-[28px] text-center font-heading font-bold text-base text-purple select-none">{quantity}</span>
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
                    setTimeout(() => onClose(), 300);
                  }}
                >
                  {inCart ? 'Agregar otro' : 'Agregar al carrito'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
