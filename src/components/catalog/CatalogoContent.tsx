'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { useProducts } from '@/lib/useProducts';
import { Category, Product, CATEGORY_ICONS } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { useCart } from '@/context/CartContext';
import { CONTACT } from '@/lib/constants';
import CategoryFilter from '@/components/catalog/CategoryFilter';
import SearchBar from '@/components/catalog/SearchBar';
import ProductCard from '@/components/catalog/ProductCard';
import ProductModal from '@/components/catalog/ProductModal';
import Button from '@/components/ui/Button';

type CatalogMode = 'planes' | 'custom';

function PlanCard({ product, onSelect, onAdd }: { product: Product; onSelect: (p: Product) => void; onAdd: (p: Product) => void }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:shadow-xl transition-shadow flex flex-col">
      <button onClick={() => onSelect(product)} className="relative aspect-[4/3] bg-gray-100 cursor-pointer group">
        {product.image ? (
          <Image src={product.image} alt={product.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="(max-width: 640px) 100vw, 50vw" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple/5 to-purple/10">
            <span className="text-6xl">{CATEGORY_ICONS[product.category]}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur rounded-full px-4 py-2 font-heading font-semibold text-sm text-purple shadow-lg">
            Ver m&aacute;s &#10024;
          </span>
        </div>
      </button>
      <div className="p-5 md:p-6 flex flex-col flex-1">
        <h3 className="font-heading font-bold text-lg md:text-xl text-gray-800 mb-2 cursor-pointer hover:text-purple transition-colors" onClick={() => onSelect(product)}>
          {product.name}
        </h3>
        <p className="font-body text-sm text-gray-500 leading-relaxed mb-4">
          {product.description}
        </p>
        <div className="mt-auto pt-4 border-t border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-heading font-bold text-2xl text-purple">{formatCurrency(product.price)}</span>
            <Button onClick={() => onAdd(product)}>
              {'\u00a1'}Lo quiero! {'\uD83C\uDF89'}
            </Button>
          </div>
          <a
            href={`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(`Hola! Me interesa ${product.name}. \u00bfMe pueden dar m\u00e1s informaci\u00f3n?`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-teal font-heading font-semibold text-xs hover:text-teal/80 transition-colors py-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Consultar por WhatsApp {'\uD83D\uDCAC'}
          </a>
        </div>
      </div>
    </div>
  );
}

export default function CatalogoContent() {
  const products = useProducts();
  const { addItem } = useCart();
  const [mode, setMode] = useState<CatalogMode>('planes');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const planes = useMemo(() => products.filter(p => p.category === 'planes'), [products]);

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

  const handleAddPlan = (product: Product) => {
    addItem({ productId: product.id, name: product.name, category: product.category, unitPrice: product.price });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <div className="mb-8 text-center">
        <h1 className="font-heading font-bold text-3xl md:text-4xl text-purple mb-2">
          {'\u00bf'}Qu&eacute; fiesta vas a crear? &#10024;
        </h1>
        <p className="font-body text-gray-500">
          Elige tu forma de armar la fiesta perfecta
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={() => setMode('planes')}
          className={`flex-1 py-3.5 px-4 rounded-2xl font-heading font-bold text-sm md:text-base transition-all ${
            mode === 'planes'
              ? 'bg-purple text-white shadow-lg'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {'\uD83D\uDCE6'} Planes completos
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`flex-1 py-3.5 px-4 rounded-2xl font-heading font-bold text-sm md:text-base transition-all ${
            mode === 'custom'
              ? 'bg-purple text-white shadow-lg'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          &#10024; Armar mi paquete
        </button>
      </div>

      {mode === 'planes' ? (
        <>
          <div className="mb-8 text-center">
            <h2 className="font-heading font-bold text-xl text-gray-800 mb-1">
              Paquetes todo incluido {'\uD83C\uDF89'}
            </h2>
            <p className="font-body text-gray-500 text-sm max-w-md mx-auto">
              La forma m&aacute;s f&aacute;cil de organizar tu fiesta. Todo listo, nosotros lo llevamos.
            </p>
          </div>
          {planes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {planes.map(product => (
                <PlanCard key={product.id} product={product} onSelect={setSelectedProduct} onAdd={handleAddPlan} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <p className="font-heading text-lg text-gray-400">Cargando planes...</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-6 text-center">
            <h2 className="font-heading font-bold text-xl text-gray-800 mb-1">
              Arma tu fiesta a tu gusto {'\uD83C\uDF88'}
            </h2>
            <p className="font-body text-gray-500 text-sm max-w-md mx-auto">
              Elige exactamente lo que necesitas.
            </p>
          </div>
          <div className="flex flex-col gap-4 mb-8">
            <SearchBar value={search} onChange={setSearch} />
            <CategoryFilter selected={category} onSelect={setCategory} />
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">{'\uD83D\uDD0D'}</div>
              <p className="font-heading font-bold text-lg text-gray-400 mb-2">No encontramos productos</p>
              <p className="font-body text-sm text-gray-400">Prueba con otra b&uacute;squeda o categor&iacute;a</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} onSelect={setSelectedProduct} />
              ))}
            </div>
          )}
        </>
      )}

      <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}
