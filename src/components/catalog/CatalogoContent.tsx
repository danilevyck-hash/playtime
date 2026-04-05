'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productGalleries, setProductGalleries] = useState<Record<string, string[]>>({});
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
      <div className="mb-6 text-center">
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-2">
          Nuestros Servicios
        </h1>
        <p className="font-body text-gray-500 text-sm">
          Elige una categor&iacute;a para explorar
        </p>
      </div>

      <div className="mb-6">
        <CategoryFilter selected={category} onSelect={handleCategoryChange} />
      </div>

      {category !== 'all' && (
        <div className="mb-4">
          <SearchBar value={search} onChange={handleSearchChange} />
        </div>
      )}

      {category === 'all' ? (
        <div className="text-center py-8">
          <p className="font-body text-sm text-gray-400">Selecciona una categor&iacute;a para ver los productos</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="font-heading font-bold text-lg text-gray-500 mb-2">No encontramos productos</p>
          <p className="font-body text-sm text-gray-500 mb-4">Prueba con otra b&uacute;squeda</p>
          <button onClick={() => handleSearchChange('')} className="bg-purple text-white font-heading font-semibold px-6 py-2.5 rounded-full hover:bg-purple/90 transition-colors text-sm">Limpiar b&uacute;squeda</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} onSelect={setSelectedProduct} />
            ))}
          </div>
          {hasMore && (
            <div className="text-center mt-8">
              <button
                onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                className="bg-purple/10 text-purple font-heading font-bold px-8 py-3 rounded-2xl hover:bg-purple/20 transition-colors"
              >
                Ver m&aacute;s ({filtered.length - visibleCount})
              </button>
            </div>
          )}
        </>
      )}

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} extraImages={selectedProduct ? productGalleries[selectedProduct.id] : undefined} />
    </div>
  );
}
