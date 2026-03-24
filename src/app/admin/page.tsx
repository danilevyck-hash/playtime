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

export default function AdminPage() {
  const [pin, setPin] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/orders', {
        headers: { 'x-admin-pin': ADMIN_PIN },
      });
      if (!res.ok) throw new Error('Error al cargar pedidos');
      const data = await res.json();
      setOrders(data.orders || []);
      if (data.message) setError(data.message);
    } catch {
      setError('No se pudieron cargar los pedidos. Verifica que Supabase esté configurado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) fetchOrders();
  }, [authenticated, fetchOrders]);

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
            <p className="font-body text-gray-500 text-sm mt-1">Ingresa el PIN para ver pedidos</p>
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
          <button
            type="submit"
            className="w-full bg-purple text-white font-heading font-bold py-3 rounded-xl hover:bg-purple-light transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading font-bold text-3xl text-purple">Pedidos</h1>
          <p className="font-body text-gray-500 text-sm">
            {orders.length} pedido{orders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="bg-purple/10 text-purple font-heading font-semibold px-4 py-2 rounded-xl hover:bg-purple/20 transition-colors disabled:opacity-50"
        >
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className="bg-yellow/20 border border-yellow rounded-xl p-4 mb-6">
          <p className="font-body text-sm text-gray-700">{error}</p>
        </div>
      )}

      {orders.length === 0 && !loading && !error && (
        <div className="text-center py-16">
          <p className="font-heading text-xl text-gray-400">No hay pedidos aún</p>
          <p className="font-body text-gray-400 mt-1">Los pedidos aparecerán aquí cuando los clientes hagan compras</p>
        </div>
      )}

      <div className="space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {/* Order header */}
            <button
              onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
              className="w-full text-left p-5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-heading font-bold text-lg text-purple">
                      #{order.order_number}
                    </span>
                    <span className={`text-xs font-heading font-semibold px-2 py-0.5 rounded-full ${
                      order.payment_method === 'bank_transfer'
                        ? 'bg-teal/10 text-teal'
                        : 'bg-orange/10 text-orange'
                    }`}>
                      {order.payment_method === 'bank_transfer' ? 'Transferencia' : 'Tarjeta'}
                    </span>
                  </div>
                  <p className="font-body text-gray-700 font-semibold">{order.customer_name}</p>
                  <p className="font-body text-gray-400 text-sm">
                    {order.event_date} · {order.event_time}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-heading font-bold text-xl text-purple">
                    {formatCurrency(order.total)}
                  </p>
                  <p className="font-body text-gray-400 text-xs mt-1">
                    {new Date(order.created_at).toLocaleDateString('es-PA')}
                  </p>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`w-5 h-5 text-gray-400 mt-2 ml-auto transition-transform ${expandedOrder === order.id ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {/* Expanded details */}
            {expandedOrder === order.id && (
              <div className="border-t border-gray-100 p-5 bg-gray-50/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="font-heading font-semibold text-xs text-gray-400 uppercase mb-1">Teléfono</p>
                    <a href={`tel:${order.customer_phone}`} className="font-body text-teal hover:underline">
                      {order.customer_phone}
                    </a>
                  </div>
                  {order.customer_email && (
                    <div>
                      <p className="font-heading font-semibold text-xs text-gray-400 uppercase mb-1">Email</p>
                      <p className="font-body text-gray-700">{order.customer_email}</p>
                    </div>
                  )}
                  <div>
                    <p className="font-heading font-semibold text-xs text-gray-400 uppercase mb-1">Dirección</p>
                    <p className="font-body text-gray-700">{order.event_address}</p>
                  </div>
                  {order.birthday_child_name && (
                    <div>
                      <p className="font-heading font-semibold text-xs text-gray-400 uppercase mb-1">Cumpleañero/a</p>
                      <p className="font-body text-gray-700">
                        {order.birthday_child_name}
                        {order.birthday_child_age ? ` (${order.birthday_child_age} años)` : ''}
                      </p>
                    </div>
                  )}
                  {order.notes && (
                    <div className="sm:col-span-2">
                      <p className="font-heading font-semibold text-xs text-gray-400 uppercase mb-1">Notas</p>
                      <p className="font-body text-gray-700">{order.notes}</p>
                    </div>
                  )}
                </div>

                {/* Items */}
                {order.items.length > 0 && (
                  <div>
                    <p className="font-heading font-semibold text-xs text-gray-400 uppercase mb-2">Artículos</p>
                    <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between px-4 py-2.5">
                          <span className="font-body text-sm text-gray-700">
                            {item.product_name} <span className="text-gray-400">x{item.quantity}</span>
                          </span>
                          <span className="font-heading font-semibold text-sm text-purple">
                            {formatCurrency(item.line_total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* WhatsApp quick action */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <a
                    href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#25D366] text-white font-heading font-semibold px-4 py-2 rounded-xl hover:bg-[#20BD5A] transition-colors text-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Contactar cliente
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
