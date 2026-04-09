'use client';

import { useState, useEffect } from 'react';
import { CONTACT } from '@/lib/constants';
import WhatsAppIcon from './WhatsAppIcon';

export default function WhatsAppButton() {
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('wa-minimized');
    if (stored === '1') setMinimized(true);
  }, []);

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
        className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white w-9 h-9 rounded-full shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center hover:scale-110 opacity-70 hover:opacity-100"
        aria-label="Abrir WhatsApp"
      >
        <WhatsAppIcon className="w-4.5 h-4.5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={handleMinimize}
        className="absolute -top-2 -left-2 w-6 h-6 bg-gray-600 hover:bg-gray-700 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md transition-colors z-10"
        aria-label="Minimizar botón de WhatsApp"
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
