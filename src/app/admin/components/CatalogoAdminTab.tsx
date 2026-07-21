'use client';

import { useState } from "react";
import ProductsTab from "./ProductsTab";
import CatalogTab from "./CatalogTab";

export default function CatalogoAdminTab() {
  const [subTab, setSubTab] = useState<'productos' | 'categorias'>('productos');
  return (
    <div>
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-5">
        <button onClick={() => setSubTab('productos')} className={`flex-1 py-1.5 rounded-md font-heading font-semibold text-xs transition-all ${subTab === 'productos' ? 'bg-white text-purple shadow-sm' : 'text-gray-500'}`}>Productos</button>
        <button onClick={() => setSubTab('categorias')} className={`flex-1 py-1.5 rounded-md font-heading font-semibold text-xs transition-all ${subTab === 'categorias' ? 'bg-white text-purple shadow-sm' : 'text-gray-500'}`}>Categor&iacute;as</button>
      </div>
      {subTab === 'productos' ? <ProductsTab /> : <CatalogTab />}
    </div>
  );
}

// ─── MAIN ADMIN PAGE ───
