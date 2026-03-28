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
    title: `${info!.label} - Cat\u00e1logo`,
    description: info!.description,
  };
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params;
  if (!validCategories.includes(category as Category)) {
    notFound();
  }
  return <CategoryContent />;
}
