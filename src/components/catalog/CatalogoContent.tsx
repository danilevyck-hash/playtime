'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useProducts } from '@/lib/useProducts';
import { useCategories } from '@/lib/useCategories';
import { Category, Product } from '@/lib/types';
import { fetchProductImages } from '@/lib/supabase-data';
import ProductCard from '@/components/catalog/ProductCard';
import ProductModal from '@/components/catalog/ProductModal';
import { CATEGORY_DOODLES } from '@/components/ui/CategoryDoodles';

export default function CatalogoContent({ initialProducts }: { initialProducts?: Product[] }) {
  const products = useProducts(initialProducts);
  const categories = useCategories();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [initialSet, setInitialSet] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedGallery, setSelectedGallery] = useState<string[] | undefined>(undefined);
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Auto-select first category when products load
  useEffect(() => {
    if (!initialSet && products.length > 0) {
      const firstCat = products[0]?.category;
      if (firstCat) { setCategory(firstCat); setInitialSet(true); }
    }
  }, [products, initialSet]);

  // Fetch gallery images only when a product modal opens (lazy, per-product)
  useEffect(() => {
    if (!selectedProduct) {
      setSelectedGallery(undefined);
      return;
    }
    let cancelled = false;
    fetchProductImages(selectedProduct.id).then((imgs) => {
      if (!cancelled && imgs.length > 0) setSelectedGallery(imgs);
    });
    return () => { cancelled = true; };
  }, [selectedProduct]);

  const filtered = useMemo(() => {
    const isSearching = search.trim() !== '';
    return products.filter((p) => {
      const matchCategory = isSearching || category === 'all' || p.category === category;
      const matchSearch =
        !isSearching ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [products, category, search]);

  const visibleProducts = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount(prev => prev + PAGE_SIZE);
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, filtered.length]);

  const handleCategoryChange = useCallback((cat: Category | 'all') => {
    setCategory(cat);
    setVisibleCount(PAGE_SIZE);
  }, []);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    setVisibleCount(PAGE_SIZE);
  }, []);

  const isSearching = search.trim() !== '';
  const activeCategoryLabel = isSearching
    ? `Resultados (${filtered.length})`
    : category === 'all'
      ? 'Todos los productos'
      : (categories.find(c => c.id === category)?.label || 'Productos');

  return (
    <div className="max-w-6xl mx-auto py-4 md:py-8">
      <h1 className="sr-only">Catálogo de Fiestas Infantiles en Panamá — PlayTime</h1>

      {/* Search bar — siempre visible arriba */}
      <div className="sticky top-16 z-30 bg-beige/95 backdrop-blur-sm px-4 pt-3 pb-3 border-b border-gray-100">
        <div className="relative">
          <input
            type="search"
            aria-label="Buscar en el catálogo"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar en todo el catálogo..."
            className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl font-body text-sm bg-white focus:border-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-purple"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Limpiar búsqueda"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Sidebar (64px) + productos */}
      <div className="flex" style={{ minHeight: 'calc(100vh - 200px)' }}>
        {/* Sidebar izquierdo */}
        <aside className="bg-gray-50 border-r border-gray-100 overflow-y-auto scrollbar-hide flex-shrink-0 w-16">
          {/* Todos */}
          <button
            onClick={() => handleCategoryChange('all')}
            className={`w-16 flex flex-col items-center gap-1 py-3 transition-colors ${
              !isSearching && category === 'all'
                ? 'bg-purple/10 border-r-2 border-purple text-purple font-semibold'
                : 'text-gray-400 hover:bg-white/60'
            }`}
            aria-label="Todos"
          >
            <span className="w-7 h-7 flex items-center justify-center" aria-hidden="true">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#888" strokeWidth="1.8" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#888" strokeWidth="1.8" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#888" strokeWidth="1.8" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#888" strokeWidth="1.8" />
              </svg>
            </span>
            <span className="text-[9px] font-heading text-center px-1 leading-tight line-clamp-1">Todos</span>
          </button>

          {/* Categorías */}
          {categories.map((cat) => {
            const isActive = !isSearching && category === cat.id;
            const Doodle = CATEGORY_DOODLES[cat.id];
            const shortLabel = cat.shortLabel || cat.label;
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`w-16 flex flex-col items-center gap-1 py-3 transition-colors ${
                  isActive
                    ? 'bg-purple/10 border-r-2 border-purple text-purple font-semibold'
                    : 'text-gray-400 hover:bg-white/60'
                }`}
                aria-label={cat.label}
              >
                <span className="w-7 h-7 flex items-center justify-center" aria-hidden="true">
                  {Doodle ? <Doodle className="w-7 h-7" /> : <span className="text-lg">{cat.icon}</span>}
                </span>
                <span className="text-[9px] font-heading text-center px-1 leading-tight line-clamp-1">{shortLabel}</span>
              </button>
            );
          })}
        </aside>

        {/* Productos */}
        <section className="flex-1 min-w-0">
          <h2 className="text-sm font-heading font-semibold text-gray-700 px-3 pt-3 pb-2 sticky top-[120px] bg-beige/95 backdrop-blur-sm z-20">
            {activeCategoryLabel}
          </h2>

          {products.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 px-3 pb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl overflow-hidden border border-gray-200">
                  <div className="aspect-[4/3] skeleton" />
                  <div className="p-3 space-y-2">
                    <div className="skeleton h-4 w-3/4" />
                    <div className="skeleton h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-3">
              <svg className="w-12 h-12 mx-auto text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="font-heading font-bold text-base text-gray-400 mb-1">No encontramos productos</p>
              <p className="font-body text-xs text-gray-400 mb-4">{isSearching ? 'Prueba con otras palabras' : 'Esta categoría está vacía'}</p>
              {isSearching && (
                <button
                  onClick={() => handleSearchChange('')}
                  className="bg-purple text-white font-heading font-semibold px-5 py-2 rounded-full text-sm"
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 px-3 pb-4">
                {visibleProducts.map((product, i) => (
                  <ProductCard key={`${category}-${product.id}`} product={product} onSelect={setSelectedProduct} index={i} />
                ))}
              </div>
              {hasMore && <div ref={loadMoreRef} className="h-8" />}
            </>
          )}
        </section>
      </div>

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} extraImages={selectedGallery} />
    </div>
  );
}
