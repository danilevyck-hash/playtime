'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { useToast } from "@/context/ToastContext";
import OrdersTab from "./components/OrdersTab";
import WebsiteTab from "./components/WebsiteTab";
import CatalogoAdminTab from "./components/CatalogoAdminTab";
import { _adminToken, _adminRole, setAdminToken, setAdminRole } from "./components/shared";

export default function AdminPage() {
  const { showToast } = useToast();
  const [pin, setPin] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'pedidos' | 'website' | 'catalogo'>('pedidos');
  const [pushEnabled, setPushEnabled] = useState(false);

  // Restore session from sessionStorage on mount
  useEffect(() => {
    try {
      const savedToken = sessionStorage.getItem('adminToken');
      const savedRole = sessionStorage.getItem('adminRole');
      if (savedToken) {
        setAdminToken(savedToken);
        setAdminRole(savedRole === 'vendedora' ? 'vendedora' : 'admin');
        setAuthenticated(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setPushEnabled(!!sub);
        });
      });
    }
  }, []);

  const togglePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
        showToast('Notificaciones desactivadas');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        });
        await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
        setPushEnabled(true);
        showToast('Notificaciones activadas');
      }
    } catch (err) {
      console.error('Push toggle error:', err);
      showToast('Error al activar notificaciones');
    }
  };
  void togglePush;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminToken(data.token || '');
        setAdminRole(data.role || 'admin');
        try {
          sessionStorage.setItem('adminToken', _adminToken);
          sessionStorage.setItem('adminRole', _adminRole);
        } catch {}
        setAuthenticated(true);
      } else {
        setError(data.error || 'PIN incorrecto');
      }
    } catch {
      setError('Error de conexión');
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
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Clean tab bar — vendedora only sees Pedidos */}
      {_adminRole === 'admin' && (
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
          {([['pedidos', 'Pedidos'], ['catalogo', 'Cat\u00e1logo'], ['website', 'Sitio']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg font-heading font-semibold text-xs transition-all ${
                tab === t ? 'bg-white text-purple shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {_adminRole === 'admin' && (
        <Link
          href="/admin/contabilidad"
          className="flex items-center justify-center gap-2 mb-6 py-2.5 rounded-xl bg-purple/10 text-purple font-heading font-semibold text-sm hover:bg-purple/20 transition-colors"
        >
          <span>💰</span> Contabilidad
        </Link>
      )}

      {tab === 'pedidos' && <OrdersTab />}
      {_adminRole === 'admin' && tab === 'catalogo' && <CatalogoAdminTab />}
      {_adminRole === 'admin' && tab === 'website' && <WebsiteTab />}
    </div>
  );
}
