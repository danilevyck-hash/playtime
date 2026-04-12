'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { CATEGORY_LABELS, Category } from '@/lib/types';
import { CATEGORY_DOODLES } from '@/components/ui/CategoryDoodles';

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
    <div className="fixed inset-0 z-[9999] bg-white md:hidden" aria-modal="true">
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

      <div className="overflow-y-auto px-5 pb-8" style={{ height: 'calc(100vh - 60px)', WebkitOverflowScrolling: 'touch' }}>
        <div className="bg-gray-50 rounded-2xl overflow-hidden">
          {CATEGORY_ORDER.map((catId, i) => {
            const Doodle = CATEGORY_DOODLES[catId];
            return (
              <Link
                key={catId}
                href={`/catalogo/${catId}`}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors ${i < CATEGORY_ORDER.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <div className="w-8 h-8 flex items-center justify-center">
                  {Doodle ? <Doodle className="w-6 h-6 text-purple" /> : <span className="text-xl">📦</span>}
                </div>
                <span className="flex-1 text-[15px] font-medium text-gray-800">{CATEGORY_LABELS[catId]}</span>
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            );
          })}
        </div>

        <div className="mt-6 bg-gray-50 rounded-2xl overflow-hidden">
          <Link href="/" onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors border-b border-gray-100">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            </div>
            <span className="flex-1 text-[15px] text-gray-800">Inicio</span>
            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link href="/catalogo" onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors border-b border-gray-100">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <span className="flex-1 text-[15px] text-gray-800">Ver todo el catálogo</span>
            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link href="/carrito" onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors">
            <div className="w-8 h-8 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
            </div>
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
