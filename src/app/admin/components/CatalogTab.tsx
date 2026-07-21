'use client';

import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/context/ToastContext";
import { fetchSetting, fetchDBProducts, DBProduct } from "@/lib/supabase-data";
import { CATEGORIES } from "@/lib/constants";
import { ALL_CATEGORIES, apiUpsertSetting } from "./shared";

export default function CatalogTab() {
  const { showToast } = useToast();
  const [dbProducts, setDbProducts] = useState<DBProduct[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string; icon: string; description: string; subtitle?: string }[]>([]);
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', emoji: '', description: '' });
  const [catDragging, setCatDragging] = useState<string | null>(null);
  const [catDragOver, setCatDragOver] = useState<string | null>(null);

  useEffect(() => { fetchDBProducts().then(setDbProducts).catch(() => {}); }, []);

  const persistCatOrder = (newCats: typeof categories, prevCats: typeof categories) => {
    setCategories(newCats);
    apiUpsertSetting('category_order', newCats.map(c => c.id)).then(ok => {
      if (ok) showToast('Orden guardado');
      else { setCategories(prevCats); showToast('No se pudo guardar el orden'); }
    }).catch(() => { setCategories(prevCats); showToast('No se pudo guardar el orden'); });
  };

  const handleCatDrop = (targetId: string) => {
    if (!catDragging || catDragging === targetId) return;
    const fromIdx = categories.findIndex(c => c.id === catDragging);
    const toIdx = categories.findIndex(c => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newCats = [...categories];
    const [moved] = newCats.splice(fromIdx, 1);
    newCats.splice(toIdx, 0, moved);
    persistCatOrder(newCats, categories);
    setCatDragging(null);
    setCatDragOver(null);
  };

  const moveCat = (catId: string, dir: -1 | 1) => {
    const idx = categories.findIndex(c => c.id === catId);
    const target = idx + dir;
    if (idx === -1 || target < 0 || target >= categories.length) return;
    const newCats = [...categories];
    [newCats[idx], newCats[target]] = [newCats[target], newCats[idx]];
    persistCatOrder(newCats, categories);
  };

  // Count products per category
  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of dbProducts) { counts[p.category] = (counts[p.category] || 0) + 1; }
    return counts;
  }, [dbProducts]);

  useEffect(() => {
    async function load() {
      const base = CATEGORIES.map(c => ({ ...c }));
      try {
        const [overrides, customCats] = await Promise.all([
          fetchSetting<Record<string, { name?: string; subtitle?: string; emoji?: string }>>('category_overrides'),
          fetchSetting<Array<{ id: string; label: string; icon: string; description: string }>>('custom_categories'),
        ]);
        if (overrides) {
          for (const cat of base) {
            const ov = overrides[cat.id];
            if (ov) {
              if (ov.name) cat.label = ov.name;
              if (ov.subtitle) cat.subtitle = ov.subtitle;
              if (ov.emoji) cat.icon = ov.emoji;
            }
          }
        }
        if (customCats && customCats.length > 0) {
          const ids = new Set<string>(base.map(c => c.id));
          for (const cc of customCats) { if (!ids.has(cc.id)) (base as Array<{ id: string; label: string; icon: string; description: string; subtitle?: string }>).push(cc); }
        }
      } catch (e) {
        console.error('Error loading category overrides:', e);
      }
      // Apply saved order
      const savedOrder = await fetchSetting<string[]>('category_order');
      if (savedOrder && savedOrder.length > 0) {
        const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
        base.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity));
      }
      setCategories(base);
    }
    load();
  }, []);

  const startEdit = (cat: typeof categories[0]) => {
    setEditingCatId(cat.id);
    setEditForm({ name: cat.label, emoji: cat.icon, subtitle: cat.subtitle || '' });
  };

  const saveEdit = async () => {
    if (!editingCatId) return;
    setSaving(true);
    // Build full overrides map
    const overrides: Record<string, { name?: string; subtitle?: string; emoji?: string }> = {};
    for (const cat of categories) {
      const orig = CATEGORIES.find(c => c.id === cat.id);
      if (!orig) continue;
      const ov: { name?: string; subtitle?: string; emoji?: string } = {};
      const isEditing = cat.id === editingCatId;
      const name = isEditing ? editForm.name : cat.label;
      const emoji = isEditing ? editForm.emoji : cat.icon;
      const subtitle = isEditing ? editForm.subtitle : (cat.subtitle || '');
      if (name !== orig.label) ov.name = name;
      if (emoji !== orig.icon) ov.emoji = emoji;
      if (subtitle !== (orig.subtitle || '')) ov.subtitle = subtitle;
      if (Object.keys(ov).length > 0) overrides[cat.id] = ov;
    }
    await apiUpsertSetting('category_overrides', overrides);
    setCategories(prev => prev.map(c => c.id === editingCatId ? { ...c, label: editForm.name, icon: editForm.emoji, subtitle: editForm.subtitle || undefined } : c));
    setEditingCatId(null);
    setSaving(false);
    showToast('Categor\u00eda guardada');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-xl text-purple mb-1">Cat&aacute;logo</h2>
          <p className="font-body text-gray-500 text-sm">Edita nombre, emoji y subt&iacute;tulo de cada categor&iacute;a</p>
        </div>
        <button onClick={() => setShowNewCat(!showNewCat)} className="bg-purple text-white font-heading font-bold px-4 py-2 rounded-xl text-sm hover:bg-purple-light transition-colors">{showNewCat ? 'Cancelar' : '+ Nueva categoría'}</button>
      </div>

      {showNewCat && (
        <div className="bg-white rounded-xl border-2 border-purple/20 p-5 space-y-3">
          <h3 className="font-heading font-bold text-sm text-purple">Nueva Categor&iacute;a</h3>
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <input value={newCat.emoji} onChange={e => setNewCat(p => ({ ...p, emoji: e.target.value }))} placeholder="{'\uD83C\uDF88'}" maxLength={4} className="border border-gray-200 rounded-lg py-1.5 px-2 font-body text-center text-lg focus:border-purple focus:outline-none" />
            <input value={newCat.name} onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))} placeholder="Nombre de la categor&iacute;a" className="border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none" />
          </div>
          <input value={newCat.description} onChange={e => setNewCat(p => ({ ...p, description: e.target.value }))} placeholder="Descripci&oacute;n corta" className="w-full border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none" />
          <button
            onClick={async () => {
              const id = newCat.name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
              if (!id) { showToast('Nombre inv\u00e1lido'); return; }
              if ([...ALL_CATEGORIES, ...categories.map(c => c.id)].includes(id)) { showToast('Esa categor\u00eda ya existe'); return; }
              const item = { id, label: newCat.name.trim(), icon: newCat.emoji || '\uD83C\uDF88', description: newCat.description.trim() };
              const existing = await fetchSetting<Array<{ id: string; label: string; icon: string; description: string }>>('custom_categories') || [];
              await apiUpsertSetting('custom_categories', [...existing, item]);
              setCategories(prev => [...prev, item]);
              setNewCat({ name: '', emoji: '', description: '' });
              setShowNewCat(false);
              showToast('Categor\u00eda creada');
            }}
            disabled={!newCat.name.trim()}
            className="w-full bg-purple text-white font-heading font-bold py-2.5 rounded-xl disabled:opacity-50"
          >
            Crear categor&iacute;a
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
        {categories.map((cat, idx) => {
          const isExpanded = expandedCatId === cat.id;
          const isEditing = editingCatId === cat.id;
          const count = productCounts[cat.id] || 0;
          const palette = ['#580459', '#84D9D0', '#F27405', '#F27289', '#49B3BF', '#F2C84B'];
          const bgColor = palette[idx % palette.length];

          return (
            <div
              key={cat.id}
              draggable
              onDragStart={() => setCatDragging(cat.id)}
              onDragOver={(e) => { e.preventDefault(); setCatDragOver(cat.id); }}
              onDragEnd={() => { setCatDragging(null); setCatDragOver(null); }}
              onDrop={() => handleCatDrop(cat.id)}
              className={`transition-all ${catDragging === cat.id ? 'opacity-40 scale-95' : ''} ${catDragOver === cat.id && catDragging !== cat.id ? 'border-t-2 border-t-purple' : ''}`}
            >
              <div className="flex items-center">
                <div className="flex flex-col pl-2">
                  <button onClick={() => moveCat(cat.id, -1)} disabled={idx === 0} className="min-h-[24px] min-w-[36px] flex items-center justify-center text-gray-400 hover:text-purple disabled:opacity-20 disabled:cursor-not-allowed text-sm leading-none" aria-label="Subir categor\u00eda">{'\u25b2'}</button>
                  <button onClick={() => moveCat(cat.id, 1)} disabled={idx === categories.length - 1} className="min-h-[24px] min-w-[36px] flex items-center justify-center text-gray-400 hover:text-purple disabled:opacity-20 disabled:cursor-not-allowed text-sm leading-none" aria-label="Bajar categor\u00eda">{'\u25bc'}</button>
                </div>
                <button onClick={() => { setExpandedCatId(isExpanded ? null : cat.id); if (isEditing) setEditingCatId(null); }} className="flex-1 text-left p-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                      style={{ backgroundColor: `${bgColor}20`, color: bgColor }}
                      aria-hidden="true"
                    >
                      {cat.icon}
                    </span>
                    <div className="min-w-0">
                      <span className="font-heading font-semibold text-sm text-gray-800 block truncate">{cat.label}</span>
                      {cat.subtitle && <p className="font-body text-xs text-gray-400 mt-0.5 truncate">{cat.subtitle}</p>}
                    </div>
                  </div>
                  <span className="text-xs font-heading font-semibold text-gray-400 flex-shrink-0">{count} prod.</span>
                </div>
              </button>
              </div>
              {isExpanded && (
                <div className="border-t border-gray-100 p-4">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[60px_1fr] gap-2">
                        <input value={editForm.emoji || ''} onChange={e => setEditForm(p => ({ ...p, emoji: e.target.value }))} placeholder="Emoji" className="border border-gray-200 rounded-lg py-1.5 px-2 font-body text-center text-lg focus:border-purple focus:outline-none" />
                        <input value={editForm.name || ''} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre" className="border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none" />
                      </div>
                      <input value={editForm.subtitle || ''} onChange={e => setEditForm(p => ({ ...p, subtitle: e.target.value }))} placeholder={"Subtítulo (opcional)"} className="w-full border border-gray-200 rounded-lg py-1.5 px-2.5 font-body text-sm focus:border-purple focus:outline-none" />
                      <div className="flex gap-2">
                        <button onClick={() => setEditingCatId(null)} className="flex-1 border border-gray-200 text-gray-600 font-heading font-semibold py-2 rounded-xl text-sm">Cancelar</button>
                        <button onClick={saveEdit} disabled={saving} className="flex-1 bg-purple text-white font-heading font-semibold py-2 rounded-xl text-sm disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="font-body text-sm text-gray-500">
                        <p>ID: <span className="text-gray-800">{cat.id}</span></p>
                        <p>Descripci&oacute;n:<span className="text-gray-800">{cat.description}</span></p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(cat)} className="bg-purple/10 text-purple hover:bg-purple/20 font-heading font-semibold px-4 py-2 rounded-xl text-sm transition-colors">Editar</button>
                        {!ALL_CATEGORIES.includes(cat.id) && (
                          <button onClick={async () => {
                            if (!window.confirm(`¿Eliminar categoría "${cat.label}"?`)) return;
                            const existing = await fetchSetting<Array<{ id: string; label: string; icon: string; description: string }>>('custom_categories') || [];
                            await apiUpsertSetting('custom_categories', existing.filter(c => c.id !== cat.id));
                            const order = categories.filter(c => c.id !== cat.id).map(c => c.id);
                            await apiUpsertSetting('category_order', order);
                            setCategories(prev => prev.filter(c => c.id !== cat.id));
                            setExpandedCatId(null);
                            showToast('Categoría eliminada');
                          }} className="bg-red-50 text-red-500 hover:bg-red-100 font-heading font-semibold px-4 py-2 rounded-xl text-sm transition-colors">Eliminar</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WEBSITE TAB (CMS) ───

