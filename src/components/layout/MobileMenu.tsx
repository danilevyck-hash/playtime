'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { CATEGORY_LABELS, CATEGORY_ICONS, Category } from '@/lib/types';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  links: { href: string; label: string }[];
}

const CATEGORY_ORDER: Category[] = ['planes', 'spa', 'show', 'snacks', 'softplay', 'bounces', 'addons', 'creative'];

export default function MobileMenu({ open, onClose, links }: MobileMenuProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const adminLink = links.find(l => l.href === '/admin');

  return (
    <div
      className="md:hidden"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, backgroundColor: '#ffffff' }}
      aria-modal="true"
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className="font-heading font-bold text-lg text-gray-800">Menú</span>
        <button
          ref={closeRef}
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200"
          aria-label="Cerrar menú"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="overflow-y-auto h-[calc(100%-60px)] px-5 pb-8" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Categories first — the main content */}
        <div className="bg-gray-50 rounded-2xl overflow-hidden">
          {CATEGORY_ORDER.map((catId, i) => (
            <Link
              key={catId}
              href={`/catalogo/${catId}`}
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors ${i < CATEGORY_ORDER.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <span className="text-xl w-8 text-center">{CATEGORY_ICONS[catId]}</span>
              <span className="flex-1 text-[15px] font-medium text-gray-800">{CATEGORY_LABELS[catId]}</span>
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>

        {/* Navigation links below */}
        <div className="mt-6 bg-gray-50 rounded-2xl overflow-hidden">
          <Link href="/" onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors border-b border-gray-100">
            <span className="text-xl w-8 text-center">🏠</span>
            <span className="flex-1 text-[15px] text-gray-800">Inicio</span>
            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link href="/catalogo" onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors border-b border-gray-100">
            <span className="text-xl w-8 text-center">🎪</span>
            <span className="flex-1 text-[15px] text-gray-800">Ver todo el catálogo</span>
            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link href="/carrito" onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors">
            <span className="text-xl w-8 text-center">🛒</span>
            <span className="flex-1 text-[15px] text-gray-800">Carrito</span>
            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {adminLink && (
          <div className="pt-6 text-center">
            <Link href={adminLink.href} onClick={onClose} className="text-[13px] text-gray-300 active:text-gray-500 transition-colors">
              {adminLink.label}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
