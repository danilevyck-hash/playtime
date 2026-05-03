'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useProducts } from '@/lib/useProducts';
import { useCategories } from '@/lib/useCategories';
import { Category, Product } from '@/lib/types';
import { fetchProductImages } from '@/lib/supabase-data';
import SearchBar from '@/components/catalog/SearchBar';
import ProductCard from '@/components/catalog/ProductCard';
import ProductModal from '@/components/catalog/ProductModal';

const CATEGORY_PALETTE = ['#580459', '#84D9D0', '#F27405', '#F27289', '#49B3BF', '#F2C84B'];

export default function CatalogoContent() {
  const products = useProducts();
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <h1 className="sr-only">Catálogo de Fiestas Infantiles en Panamá — PlayTime</h1>

      <div className="sticky top-16 z-30 bg-beige/95 backdrop-blur-sm -mx-4 px-4 pt-4 pb-3">
        <SearchBar value={search} onChange={handleSearchChange} />
      </div>

      {/* Category grid (App Store style) */}
      <div className="grid grid-cols-2 gap-3 mt-4 mb-6">
        <button
          onClick={() => handleCategoryChange('all')}
          className={`bg-white rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all hover:shadow-md active:scale-[0.98] ${category === 'all' ? 'border-2 border-purple' : 'border border-gray-100'}`}
        >
          <span
            className="flex items-center justify-center text-2xl"
            style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: '#580459', color: 'white' }}
            aria-hidden="true"
          >
            ✨
          </span>
          <span className="font-heading font-medium text-sm text-center text-gray-800">Todos</span>
        </button>
        {categories.map((cat, idx) => {
          const isActive = category === cat.id;
          const bg = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
          return (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`bg-white rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all hover:shadow-md active:scale-[0.98] ${isActive ? 'border-2 border-purple' : 'border border-gray-100'}`}
            >
              <span
                className="flex items-center justify-center text-2xl"
                style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: bg, color: 'white' }}
                aria-hidden="true"
              >
                {cat.icon}
              </span>
              <span className="font-heading font-medium text-sm text-center text-gray-800">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {products.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl overflow-hidden border border-gray-200">
              <div className="aspect-[4/3] skeleton" />
              <div className="p-3 space-y-2">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 && category !== 'all' ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <p className="font-heading font-bold text-lg text-gray-400 mb-2">No encontramos productos</p>
          <p className="font-body text-sm text-gray-400 mb-4">Prueba con otra b&uacute;squeda</p>
          <button onClick={() => handleSearchChange('')} className="bg-purple text-white font-heading font-semibold px-6 py-2.5 rounded-full hover:bg-purple/90 transition-colors text-sm">Limpiar b&uacute;squeda</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
            {visibleProducts.map((product, i) => (
              <ProductCard key={`${category}-${product.id}`} product={product} onSelect={setSelectedProduct} index={i} />
            ))}
          </div>
          {hasMore && <div ref={loadMoreRef} className="h-8" />}
        </>
      )}

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} extraImages={selectedGallery} />
    </div>
  );
}
