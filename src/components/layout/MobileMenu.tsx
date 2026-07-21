'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { CATEGORY_LABELS, Category } from '@/lib/types';
import { CATEGORY_DOODLES } from '@/components/ui/CategoryDoodles';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  links: { href: string; label: string }[];
}

const CATEGORY_ORDER: Category[] = ['planes', 'spa', 'show', 'snacks', 'softplay', 'bounces', 'addons', 'creative'];

export default function MobileMenu({ open, onClose, links }: MobileMenuProps) {
  // Focus trap: Escape closes, Tab cycles inside, focus restores to the hamburger.
  const dialogRef = useFocusTrap<HTMLDivElement>(open, onClose);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    document.body.dataset.menuOpen = '1';
    return () => {
      document.body.style.overflow = '';
      delete document.body.dataset.menuOpen;
    };
  }, [open]);

  if (!open) return null;

  const adminLink = links.find(l => l.href === '/admin');

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Menú de navegación" className="fixed inset-0 z-[9999] bg-white md:hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <span className="font-heading font-bold text-lg text-gray-800">Menú</span>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200"
          aria-label="Cerrar menú"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="overflow-y-auto px-5 pb-8 bg-white" style={{ height: 'calc(100vh - 60px)', WebkitOverflowScrolling: 'touch' }}>
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

        {/* Información */}
        <div className="mt-6">
          <p className="text-[11px] font-heading font-bold text-gray-400 uppercase tracking-wider px-4 mb-2">Información</p>
          <div className="bg-gray-50 rounded-2xl overflow-hidden">
            <Link href="/preguntas" onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors border-b border-gray-100">
              <div className="w-8 h-8 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              </div>
              <span className="flex-1 text-[15px] text-gray-800">Preguntas frecuentes</span>
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link href="/como-funciona" onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors border-b border-gray-100">
              <div className="w-8 h-8 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <span className="flex-1 text-[15px] text-gray-800">Cómo funciona</span>
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link href="/nosotros" onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors border-b border-gray-100">
              <div className="w-8 h-8 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
              <span className="flex-1 text-[15px] text-gray-800">Nosotros</span>
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link href="/terminos" onClick={onClose} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-100 transition-colors">
              <div className="w-8 h-8 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <span className="flex-1 text-[15px] text-gray-800">Términos y condiciones</span>
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
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
