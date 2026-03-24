'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '@/lib/format';

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
  event_address: string;
  birthday_child_name: string | null;
  birthday_child_age: number | null;
  payment_method: string;
  subtotal: number;
  surcharge: number;
  total: number;
  notes: string | null;
  created_at: string;
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
    try {
      const data = localStorage.getItem('playtime_reels');
      if (data) {
        const reels = JSON.parse(data);
        const urls = reels.map((r: { url: string }) => r.url);
        setReelUrls([urls[0] || '', urls[1] || '', urls[2] || '']);
      }
    } catch {}
  }, []);

  const handleSave = () => {
    const reels = reelUrls
      .filter(Boolean)
      .map((url) => {
        const id = extractReelId(url);
        return id ? { url, id } : null;
      })
      .filter(Boolean);
    localStorage.setItem('playtime_reels', JSON.stringify(reels));
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="font-body text-gray-500 text-sm">{orders.length} pedido{orders.length !== 1 ? 's' : ''}</p>
        <button onClick={fetchOrders} disabled={loading} className="bg-purple/10 text-purple font-heading font-semibold px-4 py-2 rounded-xl hover:bg-purple/20 transition-colors disabled:opacity-50 text-sm">
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {error && <div className="bg-yellow/20 border border-yellow rounded-xl p-4 mb-6"><p className="font-body text-sm text-gray-700">{error}</p></div>}

      {orders.length === 0 && !loading && !error && (
        <div className="text-center py-12">
          <p className="font-heading text-lg text-gray-400">No hay pedidos aún</p>
        </div>
      )}

      <div className="space-y-3">
        {orders.map((order) => (
          <div key={order.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <button onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)} className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-heading font-bold text-purple">#{order.order_number}</span>
                  <span className={`ml-2 text-xs font-heading font-semibold px-2 py-0.5 rounded-full ${order.payment_method === 'bank_transfer' ? 'bg-teal/10 text-teal' : 'bg-orange/10 text-orange'}`}>
                    {order.payment_method === 'bank_transfer' ? 'Transferencia' : 'Tarjeta'}
                  </span>
                  <p className="font-body text-gray-700 text-sm mt-0.5">{order.customer_name} · {order.event_date}</p>
                </div>
                <span className="font-heading font-bold text-lg text-purple">{formatCurrency(order.total)}</span>
              </div>
            </button>
            {expandedOrder === order.id && (
              <div className="border-t border-gray-100 p-4 bg-gray-50/50 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-400 font-heading text-xs uppercase">Tel</span><br/><a href={`tel:${order.customer_phone}`} className="text-teal">{order.customer_phone}</a></div>
                  <div><span className="text-gray-400 font-heading text-xs uppercase">Hora</span><br/>{order.event_time}</div>
                  <div className="col-span-2"><span className="text-gray-400 font-heading text-xs uppercase">Dirección</span><br/>{order.event_address}</div>
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
                <a href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-[#25D366] text-white font-heading font-semibold px-4 py-2 rounded-xl text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Contactar
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN ADMIN PAGE ───
export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'pedidos' | 'reels'>('pedidos');

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

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        {(['pedidos', 'reels'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-full font-heading font-semibold text-sm transition-all ${
              tab === t ? 'bg-purple text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t === 'pedidos' ? 'Pedidos' : 'Reels'}
          </button>
        ))}
      </div>

      {tab === 'pedidos' && <OrdersTab />}
      {tab === 'reels' && <ReelsTab />}
    </div>
  );
}
