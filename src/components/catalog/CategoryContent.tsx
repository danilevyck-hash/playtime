'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CATEGORIES } from '@/lib/constants';
import { useProducts } from '@/lib/useProducts';
import { Category, Product } from '@/lib/types';
import { fetchProductImages } from '@/lib/supabase-data';
import SearchBar from '@/components/catalog/SearchBar';
import ProductCard from '@/components/catalog/ProductCard';
import ProductModal from '@/components/catalog/ProductModal';

export default function CategoryContent() {
  const products = useProducts();
  const params = useParams();
  const categoryId = params.category as Category;
  const categoryInfo = CATEGORIES.find((c) => c.id === categoryId);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productGalleries, setProductGalleries] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (products.length === 0) return;
    const load = async () => {
      const galleries: Record<string, string[]> = {};
      await Promise.all(products.filter(p => p.category === categoryId).map(async (p) => {
        const imgs = await fetchProductImages(p.id);
        if (imgs.length > 0) galleries[p.id] = imgs;
      }));
      setProductGalleries(galleries);
    };
    load();
  }, [products, categoryId]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchCategory = p.category === categoryId;
      const matchSearch =
        search === '' ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [products, categoryId, search]);

  if (!categoryInfo) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <h1 className="font-heading font-bold text-2xl text-gray-400">Categor&iacute;a no encontrada</h1>
        <Link href="/catalogo" className="text-teal font-heading font-semibold mt-4 inline-block hover:underline">
          Volver al cat&aacute;logo
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <div className="mb-8">
        <Link href="/catalogo" className="text-sm text-teal font-heading font-semibold hover:underline mb-2 inline-block">
          &larr; Volver al cat&aacute;logo
        </Link>
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-1">
          {categoryInfo.label}
        </h1>
        <p className="font-body text-gray-500">{categoryInfo.description}</p>
      </div>

      <div className="mb-6">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} onSelect={setSelectedProduct} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">{'\uD83D\uDD0D'}</div>
          <p className="font-heading font-bold text-lg text-gray-400 mb-2">No encontramos productos en esta categor&iacute;a</p>
          {search && <p className="font-body text-sm text-gray-400 mb-4">Intenta con otra b&uacute;squeda</p>}
          <Link href="/catalogo" className="inline-block bg-purple text-white font-heading font-bold px-6 py-2.5 rounded-full hover:bg-purple/90 transition-colors">
            Ver todo el cat&aacute;logo
          </Link>
        </div>
      )}

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} extraImages={selectedProduct ? productGalleries[selectedProduct.id] : undefined} />
    </div>
  );
}
