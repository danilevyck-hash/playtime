import type { Metadata } from 'next';
import CarritoContent from '@/components/cart/CarritoContent';

export const metadata: Metadata = {
  title: 'Mi Carrito',
  robots: { index: false, follow: false },
};

export default function CarritoPage() {
  return <CarritoContent />;
}
