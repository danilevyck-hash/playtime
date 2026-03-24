'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CATEGORIES } from '@/lib/constants';
import { useProducts } from '@/lib/useProducts';
import { Category, Product } from '@/lib/types';
import SearchBar from '@/components/catalog/SearchBar';
import ProductCard from '@/components/catalog/ProductCard';
import ProductModal from '@/components/catalog/ProductModal';

export default function CategoryPage() {
  const products = useProducts();
  const params = useParams();
  const categoryId = params.category as Category;
  const categoryInfo = CATEGORIES.find((c) => c.id === categoryId);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchCategory = p.category === categoryId;
      const matchSearch =
        search === '' ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [categoryId, search]);

  if (!categoryInfo) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <h1 className="font-heading font-bold text-2xl text-gray-400">Categoría no encontrada</h1>
        <Link href="/catalogo" className="text-teal font-heading font-semibold mt-4 inline-block hover:underline">
          Volver al catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <div className="mb-8">
        <Link href="/catalogo" className="text-sm text-teal font-heading font-semibold hover:underline mb-2 inline-block">
          &larr; Volver al catálogo
        </Link>
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-1">
          {categoryInfo.icon} {categoryInfo.label}
        </h1>
        <p className="font-body text-gray-500">{categoryInfo.description}</p>
      </div>

      <div className="mb-6">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} onSelect={setSelectedProduct} />
        ))}
      </div>

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}
