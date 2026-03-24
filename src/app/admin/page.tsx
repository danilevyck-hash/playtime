'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatCurrency } from '@/lib/format';
import {
  fetchProductOverrides,
  fetchAllCustomProducts,
  upsertProductOverride,
  upsertCustomProduct,
  deleteCustomProduct,
  fetchSetting,
  upsertSetting,
} from '@/lib/supabase-data';

interface OrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Order {
  id: number;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  event_date: string;
  event_time: string;
  event_area: string | null;
  event_address: string;
  birthday_child_name: string | null;
  birthday_child_age: number | null;
  payment_method: string;
  subtotal: number;
  surcharge: number;
  total: number;
  notes: string | null;
  created_at: string;
  confirmed: boolean;
  items: OrderItem[];
}

const ADMIN_PIN = '2588';

function extractReelId(url: string): string | null {
  const match = url.match(/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

// ─── REELS TAB ───
function ReelsTab() {
  const [reelUrls, setReelUrls] = useState(['', '', '']);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const reels = await fetchSetting<Array<{ url: string; id: string }>>('reels');
        if (!cancelled && reels && reels.length > 0) {
          const urls = reels.map((r) => r.url);
          setReelUrls([urls[0] || '', urls[1] || '', urls[2] || '']);
          return;
        }
      } catch {}
      // Fallback to localStorage
      if (!cancelled) {
        try {
          const data = localStorage.getItem('playtime_reels');
          if (data) {
            const reels = JSON.parse(data);
            const urls = reels.map((r: { url: string }) => r.url);
            setReelUrls([urls[0] || '', urls[1] || '', urls[2] || '']);
          }
        } catch {}
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    const reels = reelUrls
      .filter(Boolean)
      .map((url) => {
        const id = extractReelId(url);
        return id ? { url, id } : null;
      })
      .filter(Boolean);

    // Save to Supabase
    const ok = await upsertSetting('reels', reels);

    // Also save to localStorage as fallback
    try { localStorage.setItem('playtime_reels', JSON.stringify(reels)); } catch {}

    if (!ok) console.error('Failed to save reels to Supabase');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-xl text-purple mb-1">Instagram Reels</h2>
        <p className="font-body text-gray-500 text-sm">Pega los links de los 3 reels que quieres mostrar en la página principal</p>
      </div>
      {reelUrls.map((url, i) => (
        <div key={i}>
          <label className="block font-heading font-semibold text-sm text-gray-600 mb-1">Reel {i + 1}</label>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              const updated = [...reelUrls];
              updated[i] = e.target.value;
              setReelUrls(updated);
            }}
            placeholder="https://www.instagram.com/reel/ABC123..."
            className="w-full border-2 border-gray-200 rounded-xl py-2.5 px-3 font-body text-sm focus:border-purple focus:outline-none"
          />
          {url && extractReelId(url) && (
            <p className="text-xs text-teal mt-1 font-body">ID detectado: {extractReelId(url)}</p>
          )}
        </div>
      ))}
      <button
        onClick={handleSave}
        className={`px-6 py-2.5 rounded-xl font-heading font-bold text-white transition-colors ${saved ? 'bg-teal' : 'bg-purple hover:bg-purple-light'}`}
      >
        {saved ? 'Guardado' : 'Guardar Reels'}
      </button>
    </div>
  );
}

// ─── ORDERS TAB ───
function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/orders', { headers: { 'x-admin-pin': ADMIN_PIN } });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setOrders(data.orders || []);
      if (data.message) setError(data.message);
    } catch {
      setError('No se pudieron cargar los pedidos. Verifica que Supabase esté configurado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const toggleConfirm = async (orderId: number, current: boolean) => {
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN },
        body: JSON.stringify({ orderId, confirmed: !current }),
      });
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, confirmed: !current } : o));
      }
    } catch {}
  };

  // Filter orders by search
  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase().trim();
    return orders.filter(o =>
      o.customer_name.toLowerCase().includes(q) ||
      o.event_date.includes(q) ||
      String(o.order_number).includes(q) ||
      (o.customer_phone && o.customer_phone.includes(q))
    );
  }, [orders, search]);

  // Monthly summary
  const monthlySummary = useMemo(() => {
    const months: Record<string, { total: number; confirmed: number; count: number; confirmedCount: number }> = {};
    for (const o of orders) {
      const date = new Date(o.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!months[key]) months[key] = { total: 0, confirmed: 0, count: 0, confirmedCount: 0 };
      months[key].total += o.total;
      months[key].count += 1;
      if (o.confirmed) {
        months[key].confirmed += o.total;
        months[key].confirmedCount += 1;
      }
    }
    return Object.entries(months)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, data]) => {
        const [y, m] = month.split('-');
        const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return { label: `${MESES[Number(m) - 1]} ${y}`, ...data };
      });
  }, [orders]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="font-body text-gray-500 text-sm">{filteredOrders.length} pedido{filteredOrders.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="bg-teal/10 text-teal font-heading font-semibold px-4 py-2 rounded-xl hover:bg-teal/20 transition-colors text-sm"
          >
            {showSummary ? 'Ocultar' : '📊 Resumen'}
          </button>
          <button onClick={fetchOrders} disabled={loading} className="bg-purple/10 text-purple font-heading font-semibold px-4 py-2 rounded-xl hover:bg-purple/20 transition-colors disabled:opacity-50 text-sm">
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, fecha o # pedido..."
          className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl font-body text-sm focus:border-purple focus:outline-none"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Monthly Summary */}
      {showSummary && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm">
          <h3 className="font-heading font-bold text-purple mb-3">Resumen de Ventas por Mes</h3>
          {monthlySummary.length === 0 ? (
            <p className="font-body text-gray-400 text-sm">No hay datos</p>
          ) : (
            <div className="space-y-2">
              {monthlySummary.map((m) => (
                <div key={m.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="font-heading font-bold text-gray-800">{m.label}</span>
                    <span className="text-gray-400 text-xs ml-2 font-body">{m.count} pedidos</span>
                  </div>
                  <div className="text-right">
                    <p className="font-heading font-bold text-purple">{formatCurrency(m.total)}</p>
                    <p className="text-xs font-body text-teal">
                      Confirmados: {formatCurrency(m.confirmed)} ({m.confirmedCount})
                    </p>
                  </div>
                </div>
              ))}
              {/* Grand total */}
              <div className="flex items-center justify-between pt-3 border-t-2 border-purple/20">
                <span className="font-heading font-bold text-purple">Total</span>
                <div className="text-right">
                  <p className="font-heading font-bold text-lg text-purple">{formatCurrency(monthlySummary.reduce((s, m) => s + m.total, 0))}</p>
                  <p className="text-xs font-body text-teal">Confirmados: {formatCurrency(monthlySummary.reduce((s, m) => s + m.confirmed, 0))}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div className="bg-yellow/20 border border-yellow rounded-xl p-4 mb-6"><p className="font-body text-sm text-gray-700">{error}</p></div>}

      {filteredOrders.length === 0 && !loading && !error && (
        <div className="text-center py-12">
          <p className="font-heading text-lg text-gray-400">{search ? 'No se encontraron pedidos' : 'No hay pedidos aún'}</p>
        </div>
      )}

      <div className="space-y-3">
        {filteredOrders.map((order) => (
          <div key={order.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${order.confirmed ? 'border-teal/30' : 'border-gray-100'}`}>
            <button onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)} className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Confirmed badge */}
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${order.confirmed ? 'bg-teal' : 'bg-gray-300'}`} />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading font-bold text-purple">#{order.order_number}</span>
                      <span className={`text-xs font-heading font-semibold px-2 py-0.5 rounded-full ${order.payment_method === 'bank_transfer' ? 'bg-teal/10 text-teal' : 'bg-orange/10 text-orange'}`}>
                        {order.payment_method === 'bank_transfer' ? 'Transferencia' : 'Tarjeta'}
                      </span>
                      {order.confirmed && (
                        <span className="text-xs font-heading font-semibold px-2 py-0.5 rounded-full bg-teal/10 text-teal">Confirmada</span>
                      )}
                    </div>
                    <p className="font-body text-gray-700 text-sm mt-0.5">{order.customer_name} · {order.event_date}</p>
                  </div>
                </div>
                <span className="font-heading font-bold text-lg text-purple">{formatCurrency(order.total)}</span>
              </div>
            </button>
            {expandedOrder === order.id && (
              <div className="border-t border-gray-100 p-4 bg-gray-50/50 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-400 font-heading text-xs uppercase">Tel</span><br/><a href={`tel:${order.customer_phone}`} className="text-teal">{order.customer_phone}</a></div>
                  <div><span className="text-gray-400 font-heading text-xs uppercase">Hora</span><br/>{order.event_time}</div>
                  {order.event_area && <div><span className="text-gray-400 font-heading text-xs uppercase">Área</span><br/>{order.event_area}</div>}
                  <div className="col-span-2"><span className="text-gray-400 font-heading text-xs uppercase">Lugar</span><br/>{order.event_address}</div>
                  {order.birthday_child_name && <div className="col-span-2"><span className="text-gray-400 font-heading text-xs uppercase">Cumpleañero/a</span><br/>{order.birthday_child_name}{order.birthday_child_age ? ` (${order.birthday_child_age} años)` : ''}</div>}
                  {order.notes && <div className="col-span-2"><span className="text-gray-400 font-heading text-xs uppercase">Notas</span><br/>{order.notes}</div>}
                </div>
                {order.items.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between px-3 py-2 text-sm">
                        <span>{item.product_name} <span className="text-gray-400">x{item.quantity}</span></span>
                        <span className="font-semibold">{formatCurrency(item.line_total)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {/* Confirm/Unconfirm button */}
                  <button
                    onClick={() => toggleConfirm(order.id, order.confirmed)}
                    className={`inline-flex items-center gap-2 font-heading font-semibold px-4 py-2 rounded-xl text-sm transition-colors ${
                      order.confirmed
                        ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        : 'bg-teal text-white hover:bg-teal/80'
                    }`}
                  >
                    {order.confirmed ? (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        Desconfirmar
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        Confirmar Venta
                      </>
                    )}
                  </button>
                  {/* WhatsApp */}
                  <a href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-[#25D366] text-white font-heading font-semibold px-4 py-2 rounded-xl text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Contactar
                  </a>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PRODUCTS TAB ───
const ALL_CATEGORIES = ['planes', 'belleza', 'entretenimiento', 'snacks', 'gymboree', 'inflables', 'piscinas', 'alquiler', 'servicios', 'manualidades'];

interface AdminProduct { id: string; name: string; cat: string; price: number; desc: string; active: boolean; custom?: boolean }

function ProductsTab() {
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [disabledIds, setDisabledIds] = useState<string[]>([]);
  const [customProducts, setCustomProducts] = useState<AdminProduct[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', cat: 'planes', price: '', desc: '' });
  const [uploading, setUploading] = useState('');
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const handleUpload = async (productId: string, file: File) => {
    setUploading(productId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('productId', productId);
      formData.append('folder', 'products');
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'x-admin-pin': '2588' },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        const newUrl = data.path;
        setImageUrls(prev => ({ ...prev, [productId]: newUrl }));

        // Save image URL to Supabase (on the override or custom product)
        const isCustom = customProducts.some(p => p.id === productId);
        if (isCustom) {
          const cp = customProducts.find(p => p.id === productId);
          if (cp) {
            upsertCustomProduct({
              id: cp.id, name: cp.name, category: cp.cat, price: cp.price,
              description: cp.desc, image_url: newUrl, active: cp.active,
            }).catch(() => {});
          }
        } else {
          upsertProductOverride({ id: productId, image_url: newUrl }).catch(() => {});
        }

        // Also save to localStorage as fallback
        try {
          const saved = { ...imageUrls, [productId]: newUrl };
          localStorage.setItem('playtime_image_urls', JSON.stringify(saved));
        } catch {}

        flash('Foto actualizada');
      } else {
        const err = await res.json();
        flash(`Error: ${err.error || 'No se pudo subir'}`);
      }
    } catch {
      flash('Error de conexión');
    } finally {
      setUploading('');
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadFromSupabase() {
      try {
        const [overrides, custom] = await Promise.all([
          fetchProductOverrides(),
          fetchAllCustomProducts(),
        ]);

        if (!cancelled && (overrides.length > 0 || custom.length > 0)) {
          const names: Record<string, string> = {};
          const disabled: string[] = [];
          const imgs: Record<string, string> = {};

          for (const o of overrides) {
            if (o.name_override) names[o.id] = o.name_override;
            if (o.disabled) disabled.push(o.id);
            if (o.image_url) imgs[o.id] = o.image_url;
          }

          for (const cp of custom) {
            if (cp.image_url) imgs[cp.id] = cp.image_url;
          }

          setNameOverrides(names);
          setDisabledIds(disabled);
          setImageUrls(imgs);
          setCustomProducts(custom.map(cp => ({
            id: cp.id,
            name: cp.name,
            cat: cp.category,
            price: cp.price,
            desc: cp.description || '',
            active: cp.active,
            custom: true,
          })));
          return;
        }
      } catch (e) {
        console.error('Supabase load failed in ProductsTab:', e);
      }

      // Fallback: localStorage
      if (!cancelled) {
        try {
          const names = localStorage.getItem('playtime_product_names');
          if (names) setNameOverrides(JSON.parse(names));
          const imgs = localStorage.getItem('playtime_image_urls');
          if (imgs) setImageUrls(JSON.parse(imgs));
          const d = localStorage.getItem('playtime_disabled');
          if (d) setDisabledIds(JSON.parse(d));
          const c = localStorage.getItem('playtime_custom_products');
          if (c) setCustomProducts(JSON.parse(c));
        } catch {}
      }
    }
    loadFromSupabase();
    return () => { cancelled = true; };
  }, []);

  const handleSaveName = async (productId: string) => {
    const updated = { ...nameOverrides, [productId]: editName };
    setNameOverrides(updated);
    setEditingId(null);

    // Save to Supabase
    upsertProductOverride({ id: productId, name_override: editName }).catch(() => {});
    // Also save to localStorage
    try { localStorage.setItem('playtime_product_names', JSON.stringify(updated)); } catch {}
    flash('Nombre guardado');
  };

  const toggleDisabled = async (productId: string) => {
    const nowDisabled = !disabledIds.includes(productId);
    const updated = nowDisabled
      ? [...disabledIds, productId]
      : disabledIds.filter(id => id !== productId);
    setDisabledIds(updated);

    // Save to Supabase
    upsertProductOverride({ id: productId, disabled: nowDisabled }).catch(() => {});
    // Also save to localStorage
    try { localStorage.setItem('playtime_disabled', JSON.stringify(updated)); } catch {}
    flash(nowDisabled ? 'Producto desactivado' : 'Producto activado');
  };

  const handleAddProduct = async () => {
    if (!newProduct.name.trim()) return;
    const id = `custom-${Date.now()}`;
    const product: AdminProduct = {
      id,
      name: newProduct.name,
      cat: newProduct.cat,
      price: Number(newProduct.price) || 0,
      desc: newProduct.desc,
      active: true,
      custom: true,
    };
    const updated = [...customProducts, product];
    setCustomProducts(updated);

    // Save to Supabase
    upsertCustomProduct({
      id,
      name: product.name,
      category: product.cat,
      price: product.price,
      description: product.desc,
      image_url: null,
      active: true,
    }).catch(() => {});

    // Also save to localStorage
    try { localStorage.setItem('playtime_custom_products', JSON.stringify(updated)); } catch {}
    setNewProduct({ name: '', cat: 'planes', price: '', desc: '' });
    setShowAdd(false);
    flash('Producto agregado');
  };

  const removeCustomProduct = async (id: string) => {
    const updated = customProducts.filter(p => p.id !== id);
    setCustomProducts(updated);

    // Delete from Supabase
    deleteCustomProduct(id).catch(() => {});
    // Also update localStorage
    try { localStorage.setItem('playtime_custom_products', JSON.stringify(updated)); } catch {}
    flash('Producto eliminado');
  };

  const flash = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 2000); };

  const builtInProducts: AdminProduct[] = [
    { id: 'plan-1', name: 'Plan #1 - Completo', cat: 'planes', price: 500, desc: '', active: true },
    { id: 'plan-2', name: 'Plan #2 - Show + Equipos', cat: 'planes', price: 380, desc: '', active: true },
    { id: 'plan-3', name: 'Plan #3 - Show + Arte', cat: 'planes', price: 260, desc: '', active: true },
    { id: 'plan-4', name: 'Plan #4 - Show de Títeres', cat: 'planes', price: 225, desc: '', active: true },
    { id: 'plan-5', name: 'Plan #5 - Animación', cat: 'planes', price: 250, desc: '', active: true },
    { id: 'plan-12', name: 'Plan #12 - Mommy & Me', cat: 'planes', price: 450, desc: '', active: true },
    { id: 'plan-6-makeup', name: 'Plan #6 - Makeup', cat: 'belleza', price: 120, desc: '', active: true },
    { id: 'plan-7-manicure', name: 'Plan #7 - Manicure', cat: 'belleza', price: 100, desc: '', active: true },
    { id: 'plan-9-hair', name: 'Plan #9 - Hair Glamour', cat: 'belleza', price: 140, desc: '', active: true },
    { id: 'plan-10-spa', name: 'Plan #10 - Spa', cat: 'belleza', price: 400, desc: '', active: true },
    { id: 'plan-11-princess', name: 'Plan #11 - Princess', cat: 'belleza', price: 700, desc: '', active: true },
    { id: 'show-titeres', name: 'Show de Títeres', cat: 'entretenimiento', price: 225, desc: '', active: true },
    { id: 'animacion', name: 'Animación 1 Hora', cat: 'entretenimiento', price: 250, desc: '', active: true },
    { id: 'personaje-animacion', name: 'Personaje con Animación', cat: 'entretenimiento', price: 380, desc: '', active: true },
    { id: 'algodon-azucar', name: 'Algodón de Azúcar', cat: 'snacks', price: 100, desc: '', active: true },
    { id: 'raspado', name: 'Raspado', cat: 'snacks', price: 130, desc: '', active: true },
    { id: 'popcorn', name: 'Pop Corn', cat: 'snacks', price: 100, desc: '', active: true },
    { id: 'slushy', name: 'Slushy', cat: 'snacks', price: 130, desc: '', active: true },
    { id: 'gymboree-blanco-grande', name: 'Gymboree Blanco Grande', cat: 'gymboree', price: 250, desc: '', active: true },
    { id: 'gymboree-blanco-chico', name: 'Gymboree Blanco Chico', cat: 'gymboree', price: 160, desc: '', active: true },
    { id: 'gymboree-rosado-grande', name: 'Gymboree Rosado Grande', cat: 'gymboree', price: 290, desc: '', active: true },
    { id: 'gymboree-rosado-chico', name: 'Gymboree Rosado Chico', cat: 'gymboree', price: 180, desc: '', active: true },
    { id: 'bubble-house', name: 'Bubble House', cat: 'inflables', price: 190, desc: '', active: true },
    { id: 'bounce-house-blanco', name: 'Bounce House', cat: 'inflables', price: 120, desc: '', active: true },
    { id: 'inflable-grande-1', name: 'Inflable Grande Tobogán', cat: 'inflables', price: 170, desc: '', active: true },
    { id: 'inflable-mediano', name: 'Inflable Mediano', cat: 'inflables', price: 140, desc: '', active: true },
    { id: 'inflable-chico', name: 'Inflable Pequeño', cat: 'inflables', price: 110, desc: '', active: true },
    { id: 'piscina-cuadrada-blanca', name: 'Piscina Cuadrada', cat: 'piscinas', price: 88, desc: '', active: true },
    { id: 'piscina-redonda-grande', name: 'Piscina Redonda Grande', cat: 'piscinas', price: 100, desc: '', active: true },
    { id: 'bumper-cars', name: 'Bumper Cars', cat: 'alquiler', price: 250, desc: '', active: true },
    { id: 'mini-parque', name: 'Mini Parque', cat: 'alquiler', price: 50, desc: '', active: true },
    { id: 'musica', name: 'Música', cat: 'servicios', price: 90, desc: '', active: true },
    { id: 'transporte', name: 'Transporte', cat: 'servicios', price: 50, desc: '', active: true },
    { id: 'teacher-extra', name: 'Teacher Extra', cat: 'servicios', price: 80, desc: '', active: true },
  ];

  const allProducts = [...builtInProducts, ...customProducts];
  const filtered = filter ? allProducts.filter(p => p.cat === filter) : allProducts;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-xl text-purple mb-1">Productos</h2>
          <p className="font-body text-gray-500 text-sm">Edita, agrega o desactiva productos</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-purple text-white font-heading font-bold px-4 py-2 rounded-xl text-sm hover:bg-purple-light transition-colors"
        >
          {showAdd ? 'Cancelar' : '+ Agregar'}
        </button>
      </div>

      {message && (
        <div className="rounded-xl p-3 text-sm font-body bg-teal/10 text-teal">{message}</div>
      )}

      {showAdd && (
        <div className="bg-white rounded-xl border-2 border-purple/20 p-5 space-y-3">
          <h3 className="font-heading font-bold text-sm text-purple">Nuevo Producto</h3>
          <input
            type="text"
            value={newProduct.name}
            onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
            placeholder="Nombre del producto"
            className="w-full border-2 border-gray-200 rounded-xl py-2 px-3 font-body text-sm focus:border-purple focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={newProduct.cat}
              onChange={(e) => setNewProduct({ ...newProduct, cat: e.target.value })}
              className="border-2 border-gray-200 rounded-xl py-2 px-3 font-body text-sm focus:border-purple focus:outline-none capitalize"
            >
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="number"
              value={newProduct.price}
              onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
              placeholder="Precio ($)"
              className="border-2 border-gray-200 rounded-xl py-2 px-3 font-body text-sm focus:border-purple focus:outline-none"
            />
          </div>
          <input
            type="text"
            value={newProduct.desc}
            onChange={(e) => setNewProduct({ ...newProduct, desc: e.target.value })}
            placeholder="Descripción breve"
            className="w-full border-2 border-gray-200 rounded-xl py-2 px-3 font-body text-sm focus:border-purple focus:outline-none"
          />
          <button
            onClick={handleAddProduct}
            disabled={!newProduct.name.trim()}
            className="w-full bg-purple text-white font-heading font-bold py-2.5 rounded-xl disabled:opacity-50"
          >
            Agregar Producto
          </button>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter('')} className={`px-3 py-1 rounded-full text-xs font-heading font-semibold ${!filter ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600'}`}>Todos</button>
        {ALL_CATEGORIES.map(c => (
          <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1 rounded-full text-xs font-heading font-semibold capitalize ${filter === c ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600'}`}>{c}</button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((product) => {
          const displayName = nameOverrides[product.id] || product.name;
          const isEditing = editingId === product.id;
          const isDisabled = disabledIds.includes(product.id);
          const imgSrc = imageUrls[product.id] || `/images/products/${product.id}.png`;

          return (
            <div key={product.id} className={`bg-white rounded-xl border p-3 transition-opacity ${isDisabled ? 'opacity-40 border-gray-200' : 'border-gray-100'}`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleDisabled(product.id)}
                  className={`w-10 h-6 rounded-full flex-shrink-0 transition-colors relative ${isDisabled ? 'bg-gray-300' : 'bg-teal'}`}
                  title={isDisabled ? 'Activar' : 'Desactivar'}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${isDisabled ? 'left-1' : 'left-5'}`} />
                </button>

                <label className="w-12 h-12 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgSrc} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading === product.id}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(product.id, f); }}
                  />
                  {uploading === product.id && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><div className="w-5 h-5 border-2 border-purple border-t-transparent rounded-full animate-spin" /></div>}
                </label>

                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 border-2 border-purple rounded-lg px-2 py-1 text-sm font-body focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(product.id); if (e.key === 'Escape') setEditingId(null); }}
                      />
                      <button onClick={() => handleSaveName(product.id)} className="px-3 py-1 bg-purple text-white rounded-lg text-xs font-heading font-semibold">OK</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="font-heading font-semibold text-sm text-gray-800 truncate">{displayName}</p>
                      <button
                        onClick={() => { setEditingId(product.id); setEditName(displayName); }}
                        className="flex-shrink-0 text-gray-400 hover:text-purple transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  )}
                  <p className="font-body text-xs text-gray-400">{product.cat} · ${product.price}</p>
                </div>

                {product.custom && (
                  <button
                    onClick={() => removeCustomProduct(product.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Eliminar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN ADMIN PAGE ───
export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'pedidos' | 'reels' | 'imagenes'>('pedidos');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      setAuthenticated(true);
    } else {
      setError('PIN incorrecto');
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream px-4">
        <form onSubmit={handleLogin} className="bg-white rounded-3xl p-8 shadow-lg max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-purple/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="font-heading font-bold text-2xl text-purple">Admin</h1>
            <p className="font-body text-gray-500 text-sm mt-1">Ingresa el PIN</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(''); }}
            placeholder="PIN de 4 dígitos"
            className="w-full text-center text-2xl tracking-[0.5em] font-heading font-bold border-2 border-gray-200 rounded-xl py-3 px-4 focus:border-purple focus:outline-none mb-4"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm text-center mb-3 font-body">{error}</p>}
          <button type="submit" className="w-full bg-purple text-white font-heading font-bold py-3 rounded-xl hover:bg-purple-light transition-colors">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-heading font-bold text-3xl text-purple mb-6">Admin</h1>

      <div className="flex gap-2 mb-8">
        {(['pedidos', 'reels', 'imagenes'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-full font-heading font-semibold text-sm transition-all ${
              tab === t ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t === 'pedidos' ? 'Pedidos' : t === 'reels' ? 'Reels' : 'Productos'}
          </button>
        ))}
      </div>

      {tab === 'pedidos' && <OrdersTab />}
      {tab === 'reels' && <ReelsTab />}
      {tab === 'imagenes' && <ProductsTab />}
    </div>
  );
}
