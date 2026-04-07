'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  links: { href: string; label: string }[];
}

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

  return (
    <div className="fixed inset-0 z-50 md:hidden" aria-modal="true">
      {/* Full-screen white overlay */}
      <div role="dialog" className="absolute inset-0 bg-white flex flex-col animate-fade-in">
        {/* Header with close button */}
        <div className="flex items-center justify-end px-4 h-16">
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

        {/* Links centered */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 -mt-16">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className="font-heading font-bold text-2xl text-gray-800 active:text-teal transition-colors py-3 px-8"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Acceso at bottom */}
        <div className="pb-10 flex justify-center">
          <Link href="/admin" onClick={onClose} className="font-body text-xs text-gray-300 active:text-gray-400">
            Acceso
          </Link>
        </div>
      </div>
    </div>
  );
}
