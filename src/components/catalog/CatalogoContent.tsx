'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useProducts } from '@/lib/useProducts';
import { Category, Product } from '@/lib/types';
import { fetchProductImages } from '@/lib/supabase-data';
import CategoryFilter from '@/components/catalog/CategoryFilter';
import SearchBar from '@/components/catalog/SearchBar';
import ProductCard from '@/components/catalog/ProductCard';
import ProductModal from '@/components/catalog/ProductModal';

export default function CatalogoContent() {
  const products = useProducts();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [initialSet, setInitialSet] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productGalleries, setProductGalleries] = useState<Record<string, string[]>>({});
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Auto-select first category when products load
  useEffect(() => {
    if (!initialSet && products.length > 0) {
      const firstCat = products[0]?.category;
      if (firstCat) { setCategory(firstCat); setInitialSet(true); }
    }
  }, [products, initialSet]);

  useEffect(() => {
    if (products.length === 0) return;
    const load = async () => {
      const galleries: Record<string, string[]> = {};
      await Promise.all(products.map(async (p) => {
        const imgs = await fetchProductImages(p.id);
        if (imgs.length > 0) galleries[p.id] = imgs;
      }));
      setProductGalleries(galleries);
    };
    load();
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchCategory = category === 'all' || p.category === category;
      const matchSearch =
        search === '' ||
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

      <div className="sticky top-16 z-30 bg-beige/95 backdrop-blur-sm -mx-4 px-4 pt-4 pb-3 space-y-3">
        <CategoryFilter selected={category} onSelect={handleCategoryChange} />
        <SearchBar value={search} onChange={handleSearchChange} />
      </div>

      {filtered.length === 0 && category !== 'all' ? (
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
              <ProductCard key={product.id} product={product} onSelect={setSelectedProduct} index={i} />
            ))}
          </div>
          {hasMore && <div ref={loadMoreRef} className="h-8" />}
        </>
      )}

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} extraImages={selectedProduct ? productGalleries[selectedProduct.id] : undefined} />
    </div>
  );
}
