'use client';

import { useState, useMemo } from 'react';
import { useProducts } from '@/lib/useProducts';
import { Category, Product } from '@/lib/types';
import CategoryFilter from '@/components/catalog/CategoryFilter';
import SearchBar from '@/components/catalog/SearchBar';
import ProductCard from '@/components/catalog/ProductCard';
import ProductModal from '@/components/catalog/ProductModal';

export default function CatalogoContent() {
  const products = useProducts();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <div className="mb-8">
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-2">
          Catálogo
        </h1>
        <p className="font-body text-gray-500">
          Explora todos nuestros servicios y arma tu paquete ideal
        </p>
      </div>

      <div className="flex flex-col gap-4 mb-8">
        <SearchBar value={search} onChange={setSearch} />
        <CategoryFilter selected={category} onSelect={setCategory} />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-heading text-xl text-gray-400">No se encontraron productos</p>
          <p className="font-body text-gray-400 mt-1">Prueba con otra búsqueda o categoría</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} onSelect={setSelectedProduct} />
          ))}
        </div>
      )}

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}
