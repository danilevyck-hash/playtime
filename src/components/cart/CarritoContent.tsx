'use client';

import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import CartItemComponent from '@/components/cart/CartItem';
import CartSummary from '@/components/cart/CartSummary';
import Button from '@/components/ui/Button';
import ConfettiBackground from '@/components/ui/ConfettiBackground';

export default function CarritoContent() {
  const { items, clearCart } = useCart();

  if (items.length === 0) {
    return (
      <ConfettiBackground className="bg-beige min-h-[60vh]">
        <div className="max-w-6xl mx-auto px-4 py-16 text-center">
          <div className="text-6xl mb-4">{'\uD83C\uDF89'}</div>
          <h1 className="font-heading font-bold text-2xl text-gray-400 mb-2">{'\u00a1'}Tu fiesta te est&aacute; esperando!</h1>
          <p className="font-body text-gray-400 mb-6">Explora nuestros servicios y arma algo incre&iacute;ble {'\uD83C\uDF89'}</p>
          <Link href="/catalogo">
            <Button>{'\u00a1'}Arma tu fiesta! {'\uD83C\uDF89'}</Button>
          </Link>
        </div>
      </ConfettiBackground>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      {/* Urgency banner */}
      <div className="bg-teal/10 rounded-2xl p-3 mb-6 text-center">
        <p className="font-heading font-semibold text-sm text-teal">
          {'\u2705'} Reserva tu fecha &mdash; la disponibilidad es limitada
        </p>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading font-bold text-3xl text-purple">Tu fiesta en progreso {'\uD83C\uDF88'}</h1>
          <p className="font-body text-gray-500">{items.length} {items.length === 1 ? 'producto' : 'productos'}</p>
        </div>
        <button
          onClick={clearCart}
          className="text-sm font-heading font-semibold text-gray-400 hover:text-pink transition-colors"
        >
          Empezar de nuevo
        </button>
      </div>

      <div className="mb-8">
        {items.map((item) => (
          <CartItemComponent key={item.productId} item={item} />
        ))}
      </div>

      <CartSummary />

      <div className="bg-gray-50 rounded-xl p-4 mt-4">
        <p className="font-body text-sm text-gray-500">
          {'\uD83D\uDE9A'} El costo de transporte, montaje y desmontaje se calcula seg&uacute;n tu &aacute;rea y se confirma en el siguiente paso.
        </p>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Link href="/catalogo" className="flex-1">
          <Button variant="outline" className="w-full">Agregar m&aacute;s diversi&oacute;n</Button>
        </Link>
        <Link href="/checkout" className="flex-1">
          <Button className="w-full" size="lg">Casi listo &rarr;</Button>
        </Link>
      </div>
    </div>
  );
}
