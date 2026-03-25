'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import Badge from '@/components/ui/Badge';
import MobileMenu from './MobileMenu';

const NAV_LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/catalogo', label: 'Cat\u00e1logo' },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { itemCount } = useCart();

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Typographic logo */}
        <Link href="/" className="flex flex-col leading-none">
          <span className="font-heading font-black text-2xl text-teal tracking-tight">play time</span>
          <span className="font-script text-xs text-purple -mt-0.5">creando momentos.</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-heading font-bold text-gray-600 hover:text-teal transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link href="/carrito" className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-600 hover:text-teal transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            <Badge count={itemCount} />
          </Link>
        </div>

        {/* Mobile: cart + hamburger */}
        <div className="flex md:hidden items-center gap-4">
          <Link href="/carrito" className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            <Badge count={itemCount} />
          </Link>
          <button
            onClick={() => setMenuOpen(true)}
            className="p-1"
            aria-label="Abrir men\u00fa"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} links={NAV_LINKS} />
    </nav>
  );
}
