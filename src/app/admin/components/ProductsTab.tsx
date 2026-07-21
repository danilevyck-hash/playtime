'use client';

import { useState, useEffect, useCallback, useMemo } from "react";
import { formatCurrency } from "@/lib/format";
import { normalizeImage } from "@/lib/products";
import { useToast } from "@/context/ToastContext";
import { fetchSetting, fetchProductImages, fetchDBProducts, fetchDBProductVariants, DBProduct, DBProductVariant } from "@/lib/supabase-data";
import { CATEGORIES } from "@/lib/constants";
import { ALL_CATEGORIES, INPUT_CLS, getCategoryEmoji, apiUpsertSetting, apiUpsertProduct, apiUpsertVariant, apiDeleteProduct, apiDeleteVariant, apiBulkUpdateOrder, revalidateSite, _adminToken } from "./shared";

export default function ProductsTab() {
  const { showToast } = useToast();
  const [products, setProducts] = useState<DBProduct[]>([]);
  const [variants, setVariants] = useState<DBProductVariant[]>([]);
  const [filter, setFilter] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', desc: '', price: '', cat: '', variant_label: '', featured: false, popular: false, max_quantity: '', min_quantity: '', quantity_step: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', cat: 'planes', price: '', desc: '' });
  const [uploading, setUploading] = useState('');
  const [imageKeys, setImageKeys] = useState<Record<string, number>>({});
  const [imageGalleries, setImageGalleries] = useState<Record<string, string[]>>({});
  const [reorderMode, setReorderMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [uploadingVariant, setUploadingVariant] = useState('');
  const [newVariant, setNewVariant] = useState<Record<string, { label: string; price: string }>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [combineMode, setCombineMode] = useState(false);
  const [combineSelected, setCombineSelected] = useState<Set<string>>(new Set());
  const [combinePrompt, setCombinePrompt] = useState(false);
  const [combineName, setCombineName] = useState('');
  const [allCategories, setAllCategories] = useState<string[]>(ALL_CATEGORIES);
  const [variantMenu, setVariantMenu] = useState<string | null>(null);

  // Cross-sell rules — loaded once, edited per-product, autosaved on toggle
  const [crossSellRules, setCrossSellRules] = useState<Record<string, string[]>>({});
  const [crossSellPicker, setCrossSellPicker] = useState<string | null>(null);

  // ─── LOAD from pt_products + pt_product_variants ───
  useEffect(() => {
    async function load() {
      try {
        const [dbProducts, dbVariants, customCats, rulesData] = await Promise.all([
          fetchDBProducts(),
          fetchDBProductVariants(),
          fetchSetting<Array<{ id: string; label: string; icon: string; description: string }>>('custom_categories'),
          fetchSetting<Record<string, string[]>>('cross_sell_rules'),
        ]);
        setProducts(dbProducts);
        setVariants(dbVariants);
        if (customCats && customCats.length > 0) {
          setAllCategories([...ALL_CATEGORIES, ...customCats.map(c => c.id)]);
        }
        if (rulesData && typeof rulesData === 'object') {
          setCrossSellRules(rulesData);
        } else {
          // Lazy import default rules
          const { DEFAULT_CROSS_SELL_RULES } = await import('@/lib/default-cross-sell-rules');
          setCrossSellRules({ ...DEFAULT_CROSS_SELL_RULES });
        }

        // Load gallery images
        const galleries: Record<string, string[]> = {};
        await Promise.all(dbProducts.map(async (p) => {
          const imgs = await fetchProductImages(p.id);
          if (imgs.length > 0) galleries[p.id] = imgs;
        }));
        setImageGalleries(galleries);
      } catch (e) {
        console.error('Load products error:', e);
      }
    }
    load();
  }, []);

  const toggleCrossSell = (productId: string, suggestId: string) => {
    setCrossSellRules(prev => {
      const current = prev[productId] || [];
      const next = current.includes(suggestId)
        ? current.filter(x => x !== suggestId)
        : current.length < 6 ? [...current, suggestId] : current;
      const updated = { ...prev, [productId]: next };
      // Auto-save (no manual button anymore)
      const clean: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(updated)) {
        if (Array.isArray(v) && v.length > 0) clean[k] = v;
      }
      apiUpsertSetting('cross_sell_rules', clean).then(() => revalidateSite()).catch(() => showToast('Error al guardar sugerencias'));
      return updated;
    });
  };

  const getVariants = useCallback((productId: string) => {
    return variants.filter(v => v.product_id === productId).sort((a, b) => a.sort_order - b.sort_order);
  }, [variants]);

  const getCatLabel = useCallback((catId: string) => {
    return CATEGORIES.find(c => c.id === catId)?.label || catId;
  }, []);

  // ─── UPLOAD IMAGE ───
  const handleUpload = async (productId: string, file: File, imageIndex = 0) => {
    if (file.size > 2 * 1024 * 1024) { showToast('Foto muy grande. Maximo 2MB'); return; }
    setUploading(`${productId}-${imageIndex}`);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', productId);
      formData.append('folder', 'products');
      formData.append('imageIndex', String(imageIndex));
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-token': _adminToken }, body: formData });
      if (res.ok) {
        const data = await res.json();
        const newUrl = data.path + '?t=' + Date.now();
        // Update UI immediately (optimistic)
        if (imageIndex === 0) {
          setProducts(prev => prev.map(p => p.id === productId ? { ...p, image_url: newUrl } : p));
          setImageKeys(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
        }
        const currentGallery = [...(imageGalleries[productId] || [])];
        while (currentGallery.length <= imageIndex) currentGallery.push('');
        currentGallery[imageIndex] = newUrl;
        if (imageIndex === 0) {
          const product = products.find(p => p.id === productId);
          currentGallery[0] = product?.image_url || newUrl;
        }
        setImageGalleries(prev => ({ ...prev, [productId]: currentGallery }));
        // Save to DB in background
        if (imageIndex === 0) {
          apiUpsertProduct({ id: productId, image_url: newUrl }).then(ok => {
            if (ok) revalidateSite();
            else showToast('Foto visible pero no se guardo en la base de datos');
          });
        }
        apiUpsertSetting(`product_images_${productId}`, currentGallery).then(ok => {
          if (!ok) showToast('Galeria no se guardo en la base de datos');
        });
        showToast('Foto actualizada');
      } else {
        const errBody = await res.json().catch(() => null);
        showToast(errBody?.error || (res.status === 401 ? 'Sesión expirada — recarga la página' : 'Error al subir foto'));
      }
    } catch (e) { console.error('Upload error:', e); showToast('Error de conexion'); }
    finally { setUploading(''); }
  };

  // ─── UPLOAD VARIANT IMAGE ───
  const handleVariantUpload = async (productId: string, variantId: string, file: File) => {
    if (file.size > 2 * 1024 * 1024) { showToast('Foto muy grande. Maximo 2MB'); return; }
    const key = `${productId}-${variantId}`;
    setUploadingVariant(key);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', `${productId}_variant_${variantId}`);
      formData.append('folder', 'variants');
      formData.append('imageIndex', '0');
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-admin-token': _adminToken }, body: formData });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        console.error('Variant upload failed:', res.status, errBody);
        showToast(errBody?.error || (res.status === 401 ? 'Sesión expirada — recarga la página' : 'Error al subir foto'));
        return;
      }
      const data = await res.json();
      const newUrl = data.path + '?t=' + Date.now();
      const variant = variants.find(v => v.product_id === productId && v.id === variantId);
      if (!variant) { showToast('Variante no encontrada'); return; }
      const updated = { ...variant, image_url: newUrl };
      // Save to DB first, then update local state
      const saved = await apiUpsertVariant(updated);
      if (!saved) {
        console.error('Variant upsert failed for', productId, variantId);
        showToast('Error al guardar imagen en base de datos');
        return;
      }
      setVariants(prev => prev.map(v => (v.product_id === productId && v.id === variantId) ? updated : v));
      revalidateSite();
      showToast('Foto de variante actualizada');
    } catch (e) { console.error('Variant upload error:', e); showToast('Error de conexion'); }
    finally { setUploadingVariant(''); }
  };

  // ─── TOGGLE ACTIVE ───
  const toggleActive = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const nowActive = !product.active;
    setProducts(prev => prev.map(p => p.id === id ? { ...p, active: nowActive } : p));
    apiUpsertProduct({ id, active: nowActive }).then(() => revalidateSite()).catch(e => { console.error('Toggle error:', e); showToast('Error al guardar'); });
    showToast(nowActive ? 'Producto activado' : 'Producto desactivado');
  };

  // ─── START EDITING ───
  const startEdit = (p: DBProduct) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      desc: p.description,
      price: String(p.price),
      cat: p.category,
      variant_label: p.variant_label || '',
      featured: p.featured,
      popular: p.popular ?? false,
      max_quantity: p.max_quantity ? String(p.max_quantity) : '',
      min_quantity: p.min_quantity ? String(p.min_quantity) : '',
      quantity_step: p.quantity_step ? String(p.quantity_step) : '',
    });
  };

  // ─── SAVE EDIT ───
  const saveEdit = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const parsedPrice = parseFloat(editForm.price);
    const parsedMax = editForm.max_quantity ? parseInt(editForm.max_quantity) : null;
    const parsedMin = editForm.min_quantity ? parseInt(editForm.min_quantity) : null;
    const parsedStep = editForm.quantity_step ? parseInt(editForm.quantity_step) : null;
    const updated: DBProduct = {
      ...product,
      name: editForm.name || product.name,
      description: editForm.desc,
      price: isNaN(parsedPrice) ? product.price : parsedPrice,
      category: editForm.cat || product.category,
      variant_label: editForm.variant_label || null,
      featured: editForm.featured,
      popular: editForm.popular,
      max_quantity: parsedMax,
      min_quantity: parsedMin,
      quantity_step: parsedStep,
    };
    setProducts(prev => prev.map(p => p.id === id ? updated : p));
    setEditingId(null);
    const ok = await apiUpsertProduct({ id, name: updated.name, description: updated.description, price: updated.price, category: updated.category, variant_label: updated.variant_label, featured: updated.featured, popular: updated.popular, max_quantity: updated.max_quantity, min_quantity: updated.min_quantity, quantity_step: updated.quantity_step });
    if (ok) revalidateSite();
    showToast(ok ? 'Producto guardado' : 'Error al guardar');
  };

  // ─── ADD PRODUCT ───
  const handleAddProduct = async () => {
    if (!newProduct.name.trim()) return;
    const id = `prod-${Date.now()}`;
    const product: DBProduct = { id, name: newProduct.name, category: newProduct.cat, price: Number(newProduct.price) || 0, description: newProduct.desc, image_url: null, active: true, featured: false, popular: false, max_quantity: null, min_quantity: null, quantity_step: null, variant_label: null, sort_order: products.length };
    setProducts(prev => [...prev, product]);
    const ok = await apiUpsertProduct(product);
    setNewProduct({ name: '', cat: 'planes', price: '', desc: '' });
    setShowAdd(false);
    if (ok) {
      revalidateSite();
      showToast('Producto agregado');
    } else {
      // Roll back the optimistic insert so the UI matches reality.
      setProducts(prev => prev.filter(p => p.id !== id));
      showToast('Error al guardar el producto');
    }
  };

  // ─── DELETE PRODUCT ───
  const handleDelete = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    setProducts(prev => prev.filter(p => p.id !== id));
    setVariants(prev => prev.filter(v => v.product_id !== id));
    setConfirmDelete(null);
    setEditingId(null);
    const ok = await apiDeleteProduct(id);
    if (ok) revalidateSite();
    showToast(ok ? 'Producto eliminado' : 'Error al eliminar');
  };

  // ─── ADD VARIANT ───
  const handleAddVariant = async (productId: string) => {
    const form = newVariant[productId];
    if (!form || !form.label.trim()) return;
    const variantId = form.label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const existingVars = getVariants(productId);
    const variant: DBProductVariant = { id: variantId, product_id: productId, label: form.label.trim(), price: form.price ? parseFloat(form.price) : null, image_url: null, sort_order: existingVars.length };
    setVariants(prev => [...prev, variant]);
    setNewVariant(prev => ({ ...prev, [productId]: { label: '', price: '' } }));
    // If product has no variant_label yet, set default
    const product = products.find(p => p.id === productId);
    if (product && !product.variant_label) {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, variant_label: 'Modelo' } : p));
      apiUpsertProduct({ id: productId, variant_label: 'Modelo' }).catch(e => console.error('Set variant_label error:', e));
    }
    const ok = await apiUpsertVariant(variant);
    if (ok) revalidateSite();
    showToast(ok ? 'Variante agregada' : 'Error al agregar variante');
  };

  // ─── DELETE VARIANT ───
  const handleDeleteVariant = async (productId: string, variantId: string) => {
    const target = variants.find(v => v.product_id === productId && v.id === variantId);
    if (!window.confirm(`¿Eliminar la variante "${target?.label || variantId}"? Esta acción no se puede deshacer.`)) return;
    setVariants(prev => prev.filter(v => !(v.product_id === productId && v.id === variantId)));
    const remaining = variants.filter(v => v.product_id === productId && v.id !== variantId);
    if (remaining.length === 0) {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, variant_label: null } : p));
      apiUpsertProduct({ id: productId, variant_label: null }).catch(e => console.error('Clear variant_label error:', e));
    }
    const ok = await apiDeleteVariant(productId, variantId);
    if (ok) revalidateSite();
    showToast(ok ? 'Variante eliminada' : 'Error al eliminar variante');
  };

  // ─── EXTRACT VARIANT TO PRODUCT ───
  const handleExtractVariant = async (productId: string, variantId: string) => {
    const variant = variants.find(v => v.product_id === productId && v.id === variantId);
    const parent = products.find(p => p.id === productId);
    if (!variant || !parent) return;
    // Create new product
    const newId = `prod-${Date.now()}`;
    const newProd: DBProduct = { id: newId, name: variant.label, category: parent.category, price: variant.price ?? parent.price, description: '', image_url: variant.image_url, active: true, featured: false, popular: false, max_quantity: null, min_quantity: null, quantity_step: null, variant_label: null, sort_order: products.length };
    setProducts(prev => [...prev, newProd]);
    await apiUpsertProduct(newProd);
    // Remove variant
    setVariants(prev => prev.filter(v => !(v.product_id === productId && v.id === variantId)));
    await apiDeleteVariant(productId, variantId);
    const remaining = variants.filter(v => v.product_id === productId && v.id !== variantId);
    if (remaining.length === 0) {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, variant_label: null } : p));
      await apiUpsertProduct({ id: productId, variant_label: null });
    }
    setVariantMenu(null);
    revalidateSite();
    showToast(`"${variant.label}" ahora es producto independiente`);
  };

  // ─── COMBINE PRODUCTS ───
  const handleCombine = async () => {
    if (!combineName.trim() || combineSelected.size < 2) return;
    const selected = products.filter(p => combineSelected.has(p.id));
    const [first, ...rest] = selected;
    // Update first product as the combined one
    const updated: DBProduct = { ...first, name: combineName.trim(), variant_label: 'Modelo' };
    setProducts(prev => prev.map(p => p.id === first.id ? updated : p));
    await apiUpsertProduct({ id: first.id, name: updated.name, variant_label: 'Modelo' });
    // Convert rest into variants of first
    const existingVars = getVariants(first.id);
    let sortIdx = existingVars.length;
    // Also add original first as variant
    const firstVariantId = first.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const firstVariant: DBProductVariant = { id: firstVariantId, product_id: first.id, label: first.name, price: first.price, image_url: first.image_url, sort_order: sortIdx++ };
    setVariants(prev => [...prev, firstVariant]);
    await apiUpsertVariant(firstVariant);
    for (const p of rest) {
      const varId = p.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const variant: DBProductVariant = { id: varId, product_id: first.id, label: p.name, price: p.price, image_url: p.image_url, sort_order: sortIdx++ };
      setVariants(prev => [...prev, variant]);
      await apiUpsertVariant(variant);
      // Delete the product
      setProducts(prev => prev.filter(pr => pr.id !== p.id));
      await apiDeleteProduct(p.id);
    }
    setCombineMode(false);
    setCombineSelected(new Set());
    setCombinePrompt(false);
    setCombineName('');
    revalidateSite();
    showToast(`${selected.length} productos combinados`);
  };

  // ─── REORDER ───
  // Persiste el nuevo orden; revierte y avisa si el server lo rechaza (no éxito silencioso).
  const persistOrder = (newProducts: DBProduct[], prevProducts: DBProduct[]) => {
    setProducts(newProducts);
    apiBulkUpdateOrder(newProducts.map(p => p.id)).then(ok => {
      if (ok) revalidateSite();
      else { setProducts(prevProducts); showToast('No se pudo guardar el orden'); }
    }).catch(() => { setProducts(prevProducts); showToast('No se pudo guardar el orden'); });
  };

  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const fromIdx = products.findIndex(p => p.id === draggingId);
    const toIdx = products.findIndex(p => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newProducts = [...products];
    const [moved] = newProducts.splice(fromIdx, 1);
    newProducts.splice(toIdx, 0, moved);
    persistOrder(newProducts, products);
    setDraggingId(null);
    setDragOverId(null);
  };

  // Reorder táctil con flechas: intercambia el producto con su vecino visible (misma categoría).
  const moveProduct = (productId: string, dir: -1 | 1) => {
    const visibleIdx = filtered.findIndex(p => p.id === productId);
    const neighbor = filtered[visibleIdx + dir];
    if (!neighbor) return;
    const a = products.findIndex(p => p.id === productId);
    const b = products.findIndex(p => p.id === neighbor.id);
    if (a === -1 || b === -1) return;
    const newProducts = [...products];
    [newProducts[a], newProducts[b]] = [newProducts[b], newProducts[a]];
    persistOrder(newProducts, products);
  };

  const filtered = useMemo(() => {
    const isSearching = productSearch.trim() !== '';
    return products.filter(p => {
      const matchFilter = isSearching || !filter || p.category === filter;
      const matchSearch = !isSearching || p.name.toLowerCase().includes(productSearch.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [products, filter, productSearch]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 className="font-heading font-bold text-xl text-purple">Productos</h2>
            {!combineMode && (
              <button onClick={() => setShowAdd(!showAdd)} className="bg-purple text-white font-heading font-bold w-9 h-9 rounded-full text-base hover:bg-purple-light transition-colors flex items-center justify-center flex-shrink-0" aria-label="Nuevo producto">
                {showAdd ? '\u00D7' : '+'}
              </button>
            )}
          </div>
          <p className="font-body text-gray-500 text-xs mt-0.5">{products.length} productos en la base de datos</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {!combineMode && (
            <>
              <button onClick={() => { setCombineMode(true); setCombineSelected(new Set()); }} className="font-heading font-bold px-3 py-2 rounded-xl text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Combinar</button>
              <button onClick={() => { setReorderMode(!reorderMode); if (reorderMode) showToast('Orden guardado'); }} className={`font-heading font-bold px-3 py-2 rounded-xl text-xs transition-colors ${reorderMode ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {reorderMode ? '\u2713 Listo' : '\u21C5 Ordenar'}
              </button>
            </>
          )}
          {combineMode && (
            <button onClick={() => { setCombineMode(false); setCombineSelected(new Set()); }} className="font-heading font-bold px-3 py-2 rounded-xl text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className={`relative ${reorderMode ? 'opacity-50 pointer-events-none' : ''}`}>
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar producto..." className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl font-body text-sm focus:border-purple focus:outline-none" />
        {productSearch && (
          <button onClick={() => setProductSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Add product form */}
      {showAdd && (
        <div className="bg-white rounded-xl border-2 border-purple/20 p-5 space-y-3">
          <h3 className="font-heading font-bold text-sm text-purple">Nuevo Producto</h3>
          <input type="text" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Nombre" className={INPUT_CLS} />
          <div className="grid grid-cols-2 gap-3">
            <select value={newProduct.cat} onChange={(e) => setNewProduct({ ...newProduct, cat: e.target.value })} className={INPUT_CLS}>{allCategories.map(c => <option key={c} value={c}>{getCatLabel(c)}</option>)}</select>
            <input type="number" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} placeholder="Precio ($)" className={INPUT_CLS} />
          </div>
          <input type="text" value={newProduct.desc} onChange={(e) => setNewProduct({ ...newProduct, desc: e.target.value })} placeholder="Descripcion" className={INPUT_CLS} />
          <button onClick={handleAddProduct} disabled={!newProduct.name.trim()} className="w-full bg-purple text-white font-heading font-bold py-2.5 rounded-xl disabled:opacity-50">Agregar</button>
        </div>
      )}

      {/* Category filter — horizontal scroll */}
      <div className={`flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 ${reorderMode ? 'opacity-50 pointer-events-none' : ''}`} style={{ scrollSnapType: 'x mandatory' }}>
        {allCategories.map(c => (
          <button key={c} onClick={() => setFilter(filter === c ? '' : c)} className={`shrink-0 px-3 py-1.5 min-h-[36px] rounded-full text-xs font-heading font-semibold transition-colors ${filter === c ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} style={{ scrollSnapAlign: 'start' }}>{getCatLabel(c)}</button>
        ))}
      </div>

      {/* Hint para reorder táctil */}
      {reorderMode && (!filter || productSearch.trim()) && (
        <div className="bg-teal/10 border border-teal/30 rounded-xl px-3 py-2.5">
          <p className="font-body text-xs text-gray-600">Selecciona <strong>una categoría</strong>{productSearch.trim() ? ' y limpia la búsqueda' : ''} para ordenar con las flechas {'▲▼'}.</p>
        </div>
      )}

      {/* Product list */}
      {filtered.length === 0 ? (
        <div className="text-center py-6">
          <p className="font-body text-sm text-gray-400">No hay productos que coincidan</p>
        </div>
      ) : (
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
        {filtered.map((product, idx) => {
          const isEditing = editingId === product.id;
          const imgSrc = normalizeImage(product.image_url) || '';
          const prodVariants = getVariants(product.id);
          const isCombineSelected = combineSelected.has(product.id);
          const canArrows = reorderMode && !!filter && !productSearch.trim();

          return (
            <div
              key={product.id}
              draggable={reorderMode}
              onDragStart={() => { if (reorderMode) setDraggingId(product.id); }}
              onDragOver={(e) => { if (reorderMode) { e.preventDefault(); setDragOverId(product.id); } }}
              onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
              onDrop={() => { if (reorderMode) handleDrop(product.id); }}
              className={`p-3 transition-all ${!product.active ? 'opacity-40' : ''} ${draggingId === product.id ? 'opacity-40 scale-95' : ''} ${dragOverId === product.id && draggingId !== product.id ? 'border-t-2 border-t-purple' : ''} ${isCombineSelected ? 'bg-purple/5' : ''}`}
            >
              {/* Collapsed view */}
              <div className="flex items-center gap-3" onClick={() => { if (combineMode) { setCombineSelected(prev => { const next = new Set(prev); if (next.has(product.id)) next.delete(product.id); else next.add(product.id); return next; }); } }}>
                {/* Combine checkbox / Toggle / Drag handle */}
                {combineMode ? (
                  <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center ${isCombineSelected ? 'bg-purple border-purple' : 'border-gray-300'}`}>
                    {isCombineSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                ) : reorderMode ? (
                  canArrows ? (
                    <div className="flex-shrink-0 flex flex-col -my-1">
                      <button onClick={(e) => { e.stopPropagation(); moveProduct(product.id, -1); }} disabled={idx === 0} className="min-h-[24px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-purple disabled:opacity-20 disabled:cursor-not-allowed text-sm leading-none" aria-label="Subir">{'\u25b2'}</button>
                      <button onClick={(e) => { e.stopPropagation(); moveProduct(product.id, 1); }} disabled={idx === filtered.length - 1} className="min-h-[24px] min-w-[44px] flex items-center justify-center text-gray-500 hover:text-purple disabled:opacity-20 disabled:cursor-not-allowed text-sm leading-none" aria-label="Bajar">{'\u25bc'}</button>
                    </div>
                  ) : (
                    <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-purple select-none text-lg leading-none px-1">{'\u2807'}</div>
                  )
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); toggleActive(product.id); }} className={`flex-shrink-0 transition-colors relative rounded-full`} style={{ width: 44, height: 26, backgroundColor: product.active ? '#1D9E75' : '#D1D5DB' }} aria-label={product.active ? 'Desactivar' : 'Activar'}>
                    <div className="bg-white rounded-full absolute transition-all shadow-sm" style={{ width: 20, height: 20, top: 3, left: product.active ? 21 : 3 }} />
                  </button>
                )}

                {/* Thumbnail 52x52 */}
                <div className="bg-gray-100 overflow-hidden flex-shrink-0" style={{ width: 52, height: 52, borderRadius: 10 }}>
                  {imgSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={`${product.id}-${imageKeys[product.id] || 0}`} src={imgSrc} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">{getCategoryEmoji(product.category)}</div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0" onClick={(e) => { if (!combineMode) { e.stopPropagation(); if (isEditing) { setEditingId(null); } else { startEdit(product); } } }}>
                  <p className="font-heading font-semibold text-sm text-gray-800 truncate">{product.name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="font-body text-xs text-gray-400">${product.price}</span>
                    <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-heading font-semibold text-gray-500">{getCatLabel(product.category)}</span>
                    {prodVariants.length > 0 && <span className="text-[10px] text-purple font-heading font-semibold">{prodVariants.length} var.</span>}
                    {product.featured && <span className="text-[10px] text-orange font-heading font-bold">DEST.</span>}
                    {product.popular && <span className="text-[10px] text-orange font-heading font-bold">POP.</span>}
                  </div>
                </div>

                {/* Copiar link directo al producto */}
                {!combineMode && !reorderMode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = `${window.location.origin}/catalogo/${product.id}`;
                      const fallback = () => {
                        try {
                          const ta = document.createElement('textarea');
                          ta.value = url;
                          ta.style.position = 'fixed';
                          ta.style.opacity = '0';
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                          showToast('Link copiado');
                        } catch {
                          showToast('No se pudo copiar el link');
                        }
                      };
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(url).then(() => showToast('Link copiado')).catch(fallback);
                      } else {
                        fallback();
                      }
                    }}
                    className="text-gray-400 hover:text-purple flex-shrink-0 p-1.5 rounded-lg hover:bg-purple/5 transition-colors"
                    aria-label="Copiar link del producto"
                    title="Copiar link"
                  >
                    {'🔗'}
                  </button>
                )}
              </div>

              {/* Expanded edit form */}
              {isEditing && !combineMode && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Nombre" className={INPUT_CLS} />
                  <input type="text" value={editForm.desc} onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })} placeholder="Descripcion" className={INPUT_CLS} />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} placeholder="Precio" className={INPUT_CLS} />
                    <select value={editForm.cat} onChange={(e) => setEditForm({ ...editForm, cat: e.target.value })} className={INPUT_CLS}>
                      {allCategories.map(c => <option key={c} value={c}>{getCatLabel(c)}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" min="1" value={editForm.min_quantity} onChange={(e) => setEditForm({ ...editForm, min_quantity: e.target.value })} placeholder="Min. unidades" className={INPUT_CLS} />
                    <input type="number" min="1" value={editForm.quantity_step} onChange={(e) => setEditForm({ ...editForm, quantity_step: e.target.value })} placeholder="Paquete de" className={INPUT_CLS} />
                    <input type="number" value={editForm.max_quantity} onChange={(e) => setEditForm({ ...editForm, max_quantity: e.target.value })} placeholder="Max. unidades" className={INPUT_CLS} />
                  </div>
                  <p className="font-body text-[10px] text-gray-400 -mt-1">Ejemplo silla: min=8, paquete=8 → suma de 8 en 8</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editForm.featured} onChange={(e) => setEditForm({ ...editForm, featured: e.target.checked })} className="w-4 h-4 accent-purple rounded" />
                      <span className="font-body text-sm text-gray-600">Destacado</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={editForm.popular} onChange={(e) => setEditForm({ ...editForm, popular: e.target.checked })} className="w-4 h-4 accent-orange rounded" />
                      <span className="font-body text-sm text-gray-600">Popular</span>
                    </label>
                  </div>

                  {/* Image gallery (3 slots) */}
                  <div>
                    <p className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider mb-2">Fotos</p>
                    <div className="flex gap-2">
                      {[0, 1, 2].map(idx => {
                        const gallery = imageGalleries[product.id] || [];
                        const slotUrl = idx === 0 ? imgSrc : (gallery[idx] || '');
                        const isUploading = uploading === `${product.id}-${idx}`;
                        return (
                          <label key={idx} className="w-16 h-16 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer relative group">
                            {slotUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={`${product.id}-${idx}-${imageKeys[product.id] || 0}`} src={slotUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs font-bold">+</div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            </div>
                            <input type="file" accept="image/*" className="hidden" disabled={!!uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(product.id, f, idx); }} />
                            {isUploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><div className="w-3 h-3 border-2 border-purple border-t-transparent rounded-full animate-spin" /></div>}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cross-sell rules section */}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider">Sugeridos al agregar</p>
                      <span className="font-heading font-bold text-[10px] text-orange">
                        {(crossSellRules[product.id] || []).length}/6
                      </span>
                    </div>
                    {(crossSellRules[product.id] || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {(crossSellRules[product.id] || []).map(sid => {
                          const sp = products.find(x => x.id === sid);
                          return (
                            <span key={sid} className="inline-flex items-center gap-1 bg-orange/10 text-orange px-2 py-0.5 rounded-full text-[10px] font-heading font-semibold">
                              {sp?.name || sid}
                              <button
                                onClick={() => toggleCrossSell(product.id, sid)}
                                className="hover:text-red-500"
                                aria-label="Quitar sugerido"
                              >{'\u00d7'}</button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <button
                      onClick={() => setCrossSellPicker(crossSellPicker === product.id ? null : product.id)}
                      className="text-[10px] font-heading font-semibold text-purple hover:text-purple-light"
                    >
                      {crossSellPicker === product.id ? '\u2191 Cerrar' : '+ Agregar producto sugerido'}
                    </button>
                    {crossSellPicker === product.id && (
                      <div className="mt-2 max-h-[200px] overflow-y-auto bg-gray-50 rounded-lg p-2 space-y-0.5">
                        {products.filter(p => p.active && p.id !== product.id).map(p => {
                          const checked = (crossSellRules[product.id] || []).includes(p.id);
                          const disabled = !checked && (crossSellRules[product.id] || []).length >= 6;
                          return (
                            <label key={p.id} className={`flex items-center gap-2 p-1 rounded cursor-pointer text-xs ${checked ? 'bg-orange/10' : 'hover:bg-white'} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}>
                              <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCrossSell(product.id, p.id)} className="w-3 h-3 accent-orange" />
                              <span className="font-body text-gray-700 truncate flex-1">{p.name}</span>
                              <span className="font-body text-gray-400 text-[10px]">{formatCurrency(p.price)}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Variants section */}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="font-heading font-semibold text-xs text-gray-400 uppercase tracking-wider">Variantes</p>
                        {(product.variant_label || prodVariants.length > 0) && (
                          <input type="text" value={editForm.variant_label} onChange={(e) => setEditForm({ ...editForm, variant_label: e.target.value })} placeholder="Label (ej: Color)" className="border border-gray-200 rounded-lg px-2 py-0.5 text-xs font-body w-24 focus:border-purple focus:outline-none" />
                        )}
                      </div>
                      {(product.variant_label || prodVariants.length > 0) ? (
                        <button onClick={() => setNewVariant(prev => ({ ...prev, [product.id]: { label: '', price: '' } }))} className="text-purple font-heading font-bold text-xs">+ Agregar</button>
                      ) : (
                        <button onClick={() => {
                          setEditForm(prev => ({ ...prev, variant_label: 'Modelo' }));
                          setNewVariant(prev => ({ ...prev, [product.id]: { label: '', price: '' } }));
                        }} className="text-purple font-heading font-bold text-xs">Agregar variantes</button>
                      )}
                    </div>

                    {/* Existing variants */}
                    {prodVariants.map(v => (
                      <div key={v.id} className="flex items-center gap-2 mb-1.5 bg-gray-50 rounded-lg p-2 relative">
                        <label className="w-9 h-9 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer relative group">
                          {v.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={normalizeImage(v.image_url) || ''} alt={v.label} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px] font-bold">+</div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                          <input type="file" accept="image/*" className="hidden" disabled={!!uploadingVariant} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVariantUpload(product.id, v.id, f); }} />
                          {uploadingVariant === `${product.id}-${v.id}` && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><div className="w-2 h-2 border-2 border-purple border-t-transparent rounded-full animate-spin" /></div>}
                        </label>
                        <div className="flex-1 min-w-0">
                          <span className="font-heading text-xs text-gray-700 truncate block">{v.label}</span>
                          <textarea
                            defaultValue={v.description || ''}
                            placeholder="Descripción de esta variante (opcional)"
                            rows={1}
                            className="w-full border border-gray-200 rounded-md px-1.5 py-0.5 text-[10px] font-body text-gray-500 mt-0.5 resize-none focus:border-purple focus:outline-none"
                            onBlur={(e) => {
                              const newDesc = e.target.value.trim();
                              const oldDesc = v.description || '';
                              if (newDesc === oldDesc) return;
                              const updated = { ...v, description: newDesc || null };
                              setVariants(prev => prev.map(vv => (vv.product_id === v.product_id && vv.id === v.id) ? updated : vv));
                              apiUpsertVariant(updated).then(ok => { if (ok) revalidateSite(); else showToast('Error al guardar descripción'); });
                            }}
                          />
                        </div>
                        {v.price !== null && <span className="font-body text-xs text-gray-400 flex-shrink-0">${v.price}</span>}
                        {/* Menu button */}
                        <button onClick={() => setVariantMenu(variantMenu === `${product.id}-${v.id}` ? null : `${product.id}-${v.id}`)} className="text-gray-400 hover:text-gray-600 px-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                        </button>
                        <button onClick={() => handleDeleteVariant(product.id, v.id)} className="text-gray-400 hover:text-red-500 flex-shrink-0">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        {/* Variant menu dropdown */}
                        {variantMenu === `${product.id}-${v.id}` && (
                          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-10 min-w-[180px]">
                            <button onClick={() => handleExtractVariant(product.id, v.id)} className="w-full text-left px-3 py-2 font-body text-xs text-gray-700 hover:bg-gray-50">
                              Hacer producto independiente
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add variant inline form */}
                    {newVariant[product.id] && (
                      <div className="flex items-center gap-2 mt-1">
                        <input type="text" value={newVariant[product.id].label} onChange={(e) => setNewVariant(prev => ({ ...prev, [product.id]: { ...prev[product.id], label: e.target.value } }))} placeholder="Nombre de variante" className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-body focus:border-purple focus:outline-none" />
                        <input type="number" value={newVariant[product.id].price} onChange={(e) => setNewVariant(prev => ({ ...prev, [product.id]: { ...prev[product.id], price: e.target.value } }))} placeholder="$ (opc)" className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-body focus:border-purple focus:outline-none" />
                        <button onClick={() => handleAddVariant(product.id)} disabled={!newVariant[product.id]?.label.trim()} className="bg-purple text-white font-heading font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50">+</button>
                        <button onClick={() => setNewVariant(prev => { const n = { ...prev }; delete n[product.id]; return n; })} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setEditingId(null)} className="flex-1 border-2 border-gray-200 text-gray-600 font-heading font-semibold py-2 rounded-xl text-sm">Cancelar</button>
                    <button onClick={() => saveEdit(product.id)} className="flex-1 bg-purple text-white font-heading font-semibold py-2 rounded-xl text-sm">Guardar</button>
                    <button onClick={() => setConfirmDelete(product.id)} className="px-4 bg-red-50 text-red-500 font-heading font-semibold py-2 rounded-xl text-sm hover:bg-red-100">Eliminar</button>
                  </div>

                  {/* Confirm delete dialog */}
                  {confirmDelete === product.id && (
                    <div className="bg-red-50 rounded-xl p-3 border border-red-200">
                      <p className="font-body text-sm text-red-700 mb-2">Eliminar &ldquo;{product.name}&rdquo;? Esta accion no se puede deshacer.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-1.5 rounded-lg text-xs">Cancelar</button>
                        <button onClick={() => handleDelete(product.id)} className="flex-1 bg-red-500 text-white font-heading font-semibold py-1.5 rounded-lg text-xs">Eliminar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-6">
            <p className="font-body text-sm text-gray-400">No se encontraron productos</p>
          </div>
        )}
      </div>
      )}

      {/* Combine bottom bar */}
      {combineMode && combineSelected.size >= 2 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50 safe-area-pb">
          {!combinePrompt ? (
            <button onClick={() => { setCombinePrompt(true); setCombineName(''); }} className="w-full bg-purple text-white font-heading font-bold py-3 rounded-xl text-sm">
              Combinar ({combineSelected.size})
            </button>
          ) : (
            <div className="space-y-2">
              <p className="font-heading font-semibold text-sm text-gray-700">Nombre del producto combinado:</p>
              <input type="text" value={combineName} onChange={(e) => setCombineName(e.target.value)} placeholder="Nombre del producto" className={INPUT_CLS} autoFocus />
              <div className="flex gap-2">
                <button onClick={() => setCombinePrompt(false)} className="flex-1 border-2 border-gray-200 text-gray-600 font-heading font-semibold py-2.5 rounded-xl text-sm">Cancelar</button>
                <button onClick={handleCombine} disabled={!combineName.trim()} className="flex-1 bg-purple text-white font-heading font-bold py-2.5 rounded-xl text-sm disabled:opacity-50">Combinar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── CATALOG TAB ───
