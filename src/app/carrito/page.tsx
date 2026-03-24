'use client';

import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import CartItemComponent from '@/components/cart/CartItem';
import CartSummary from '@/components/cart/CartSummary';
import Button from '@/components/ui/Button';
import ConfettiBackground from '@/components/ui/ConfettiBackground';

export default function CarritoPage() {
  const { items, clearCart } = useCart();

  if (items.length === 0) {
    return (
      <ConfettiBackground className="bg-beige min-h-[60vh]">
        <div className="max-w-6xl mx-auto px-4 py-16 text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h1 className="font-heading font-bold text-2xl text-gray-400 mb-2">Tu carrito está vacío</h1>
          <p className="font-body text-gray-400 mb-6">Agrega productos del catálogo para empezar</p>
          <Link href="/catalogo">
            <Button>Explorar Catálogo</Button>
          </Link>
        </div>
      </ConfettiBackground>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading font-bold text-3xl text-purple">Mi Carrito</h1>
          <p className="font-body text-gray-500">{items.length} {items.length === 1 ? 'producto' : 'productos'}</p>
        </div>
        <button
          onClick={clearCart}
          className="text-sm font-heading font-semibold text-gray-400 hover:text-pink transition-colors"
        >
          Vaciar carrito
        </button>
      </div>

      <div className="mb-8">
        {items.map((item) => (
          <CartItemComponent key={item.productId} item={item} />
        ))}
      </div>

      <CartSummary />

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Link href="/catalogo" className="flex-1">
          <Button variant="outline" className="w-full">Agregar más diversión</Button>
        </Link>
        <Link href="/checkout" className="flex-1">
          <Button className="w-full" size="lg">Proceder al Checkout</Button>
        </Link>
      </div>
    </div>
  );
}
