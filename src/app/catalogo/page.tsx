import type { Metadata } from 'next';
import CatalogoContent from '@/components/catalog/CatalogoContent';
import { fetchCatalogProducts } from '@/lib/products-server';

// ISR: revalidate every 60s (admin /api/revalidate invalidates on changes).
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Catálogo de Fiestas Infantiles en Panamá',
  description: 'Explora nuestro catálogo de servicios para fiestas infantiles en Panamá: inflables, shows, spa, snacks, soft play y más.',
  openGraph: {
    title: 'Catálogo de Fiestas Infantiles — PlayTime Panamá',
    description: 'Explora nuestro catálogo de servicios para fiestas infantiles en Panamá: inflables, shows, spa, snacks, soft play y más.',
    url: 'https://playtime-kids.vercel.app/catalogo',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Catálogo de Fiestas Infantiles — PlayTime Panamá',
    description: 'Explora nuestro catálogo de servicios para fiestas infantiles en Panamá.',
    images: ['/logo.png'],
  },
};

export default async function CatalogoPage() {
  const initialProducts = await fetchCatalogProducts();
  return <CatalogoContent initialProducts={initialProducts} />;
}
