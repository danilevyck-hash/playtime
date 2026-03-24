import type { Metadata } from 'next';
import { CATEGORIES } from '@/lib/constants';
import { Category } from '@/lib/types';
import CategoryContent from '@/components/catalog/CategoryContent';

interface Props {
  params: Promise<{ category: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const info = CATEGORIES.find((c) => c.id === (category as Category));
  if (!info) return { title: 'Categor\u00eda no encontrada' };
  return {
    title: `${info.label} - Cat\u00e1logo`,
    description: info.description,
  };
}

export default function CategoryPage() {
  return <CategoryContent />;
}
