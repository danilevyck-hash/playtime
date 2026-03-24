import type { Metadata } from 'next';
import CatalogoContent from '@/components/catalog/CatalogoContent';

export const metadata: Metadata = {
  title: 'Cat\u00e1logo de Servicios',
};

export default function CatalogoPage() {
  return <CatalogoContent />;
}
