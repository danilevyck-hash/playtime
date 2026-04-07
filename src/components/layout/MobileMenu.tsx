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
    // Focus the close button when menu opens
    closeRef.current?.focus();

    // Close on Escape key
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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" className="absolute right-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col animate-slide-in">
        <div className="flex items-center justify-end p-4">
          <button ref={closeRef} onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100" aria-label="Cerrar menú">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col px-6 gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className="font-heading font-semibold text-lg text-gray-700 hover:text-teal transition-colors py-3 border-b border-gray-50"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="mt-auto px-6 pb-8">
          <Link href="/admin" onClick={onClose} className="font-body text-xs text-gray-300">
            Acceso
          </Link>
        </div>
      </div>
    </div>
  );
}
