import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CATEGORIES, PRODUCTS } from '@/lib/constants';
import { Category, Product, ProductVariant } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import CategoryContent from '@/components/catalog/CategoryContent';
import ProductDetailClient from './ProductDetailClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ category: string }>;
}

const validCategories = CATEGORIES.map((c) => c.id);

async function getProduct(id: string): Promise<Product | null> {
  if (supabase) {
    try {
      const { data: p } = await supabase
        .from('pt_products')
        .select('*')
        .eq('id', id)
        .eq('active', true)
        .maybeSingle();
      if (p) {
        const { data: vs } = await supabase
          .from('pt_product_variants')
          .select('*')
          .eq('product_id', id)
          .order('sort_order', { ascending: true });
        const variants: ProductVariant[] | undefined = vs && vs.length > 0
          ? vs.map(v => ({
              id: v.id,
              label: v.label,
              price: v.price ?? undefined,
              image: v.image_url ?? undefined,
              description: v.description ?? undefined,
            }))
          : undefined;
        return {
          id: p.id,
          name: p.name,
          category: p.category as Category,
          description: p.description,
          price: p.price,
          image: p.image_url || undefined,
          featured: p.featured,
          popular: p.popular ?? false,
          maxQuantity: p.max_quantity ?? undefined,
          minQuantity: p.min_quantity ?? undefined,
          quantityStep: p.quantity_step ?? undefined,
          variants,
          variantLabel: p.variant_label ?? undefined,
        };
      }
    } catch (e) {
      console.error('getProduct DB error:', e);
    }
  }
  return PRODUCTS.find(p => p.id === id) || null;
}

async function getGalleryImages(id: string): Promise<string[]> {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from('pt_settings')
      .select('value')
      .eq('key', `product_images_${id}`)
      .maybeSingle();
    const value = data?.value;
    return Array.isArray(value) ? value.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;

  if (validCategories.includes(category as Category)) {
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

  const product = await getProduct(category);
  if (product) {
    return {
      title: `${product.name} — PlayTime Kids`,
      description: product.description,
      openGraph: {
        title: `${product.name} — PlayTime Kids`,
        description: product.description,
        images: product.image ? [product.image] : ['/logo.png'],
      },
    };
  }

  return { title: 'Producto no encontrado — PlayTime Kids' };
}

export default async function CatalogoSlugPage({ params }: Props) {
  const { category } = await params;

  if (validCategories.includes(category as Category)) {
    return <CategoryContent />;
  }

  const product = await getProduct(category);
  if (!product) notFound();
  const gallery = await getGalleryImages(category);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-10">
      <Link
        href="/catalogo"
        className="inline-flex items-center gap-1 font-heading font-semibold text-sm text-purple hover:text-purple/80 mb-4"
      >
        <span aria-hidden="true">{'←'}</span> Volver al cat{'á'}logo
      </Link>
      <ProductDetailClient product={product} gallery={gallery} />
    </div>
  );
}
