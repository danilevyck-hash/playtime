'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { CONTACT } from '@/lib/constants';
import WhatsAppIcon from './WhatsAppIcon';

export default function WhatsAppButton() {
  const [minimized, setMinimized] = useState(false);
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const stored = sessionStorage.getItem('wa-minimized');
    if (stored === '1') setMinimized(true);
  }, []);

  // Hide when mobile menu is open (body[data-menu-open]) or on cart page (sticky CTA overlaps)
  useEffect(() => {
    const check = () => {
      const menuOpen = document.body.dataset.menuOpen === '1';
      setHidden(menuOpen);
    };

    // Use MutationObserver to watch body attributes
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-menu-open'] });
    check();

    return () => observer.disconnect();
  }, []);

  // Hide on cart page on mobile (sticky CTA bar overlaps)
  const isCartPage = pathname === '/carrito';
  // Never show in admin
  const isAdminPage = pathname.startsWith('/admin');

  if (hidden || isAdminPage) return null;

  const handleMinimize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMinimized(true);
    sessionStorage.setItem('wa-minimized', '1');
  };

  const handleExpand = () => {
    setMinimized(false);
    sessionStorage.removeItem('wa-minimized');
  };

  if (minimized) {
    return (
      <button
        onClick={handleExpand}
        className={`fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 z-50 mb-4 bg-[#25D366] text-white w-9 h-9 rounded-full shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center hover:scale-110 opacity-70 hover:opacity-100 ${isCartPage ? 'sm:flex hidden' : ''}`}
        aria-label="Abrir WhatsApp"
      >
        <WhatsAppIcon className="w-4.5 h-4.5" />
      </button>
    );
  }

  return (
    <div className={`fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 z-50 mb-4 ${isCartPage ? 'sm:block hidden' : ''}`}>
      <button
        onClick={handleMinimize}
        className="absolute -top-3 -left-3 w-8 h-8 bg-gray-700 hover:bg-gray-800 text-white rounded-full flex items-center justify-center text-base font-bold shadow-md transition-colors z-10"
        aria-label="Minimizar bot&oacute;n de WhatsApp"
      >
        &times;
      </button>
      <a
        href={`https://wa.me/${CONTACT.whatsapp}`}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-[#25D366] hover:bg-[#20BD5A] text-white w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center hover:scale-110"
        aria-label="Contactar por WhatsApp"
      >
        <WhatsAppIcon className="w-7 h-7" />
      </a>
    </div>
  );
}
