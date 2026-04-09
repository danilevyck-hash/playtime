import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATEGORIES } from '@/lib/constants';
import { Category } from '@/lib/types';
import CategoryContent from '@/components/catalog/CategoryContent';

interface Props {
  params: Promise<{ category: string }>;
}

const validCategories = CATEGORIES.map((c) => c.id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  if (!validCategories.includes(category as Category)) {
    return { title: 'Categor\u00eda no encontrada' };
  }
  const info = CATEGORIES.find((c) => c.id === category);
  return {
    title: `${info!.label} para Fiestas — PlayTime`,
    description: info!.description,
    openGraph: {
      title: `${info!.label} para Fiestas — PlayTime Panamá`,
      description: info!.description,
      url: `https://playtime-kids.vercel.app/catalogo/${category}`,
      images: ['/logo.png'],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: `${info!.label} para Fiestas — PlayTime Panamá`,
      description: info!.description,
      images: ['/logo.png'],
    },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params;
  if (!validCategories.includes(category as Category)) {
    notFound();
  }
  return <CategoryContent />;
}
