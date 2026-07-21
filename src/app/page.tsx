import type { Metadata } from 'next';
import { fetchSetting, fetchLogoUrl } from '@/lib/supabase-data';
import { fetchCatalogProducts } from '@/lib/products-server';
import { Product } from '@/lib/types';
import Hero from '@/components/landing/Hero';
import ServicesOverview from '@/components/landing/ServicesOverview';
import FeaturedProducts from '@/components/landing/FeaturedProducts';
import Testimonials from '@/components/landing/Testimonials';
import CTABanner from '@/components/landing/CTABanner';

// Revalidar cada 60 segundos para reflejar cambios del admin sin necesidad de push
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Fiestas Infantiles en Panam\u00e1 | PlayTime',
  description: 'Organizamos fiestas infantiles completas en Panam\u00e1: animaci\u00f3n, inflables, gymboree, snacks y manualidades. Dise\u00f1amos tu evento y lo llevamos hasta tu puerta.',
};

interface HomepageContent {
  hero_title?: string;
  hero_subtitle?: string;
  hero_cta_primary?: string;
  social_proof_text?: string;
  services_title?: string;
  services_subtitle?: string;
  featured_title?: string;
  featured_subtitle?: string;
  cta_section_title?: string;
  cta_section_subtitle?: string;
}

export default async function Home() {
  let content: HomepageContent | null = null;
  let featuredIds: string[] | null = null;
  let logoUrl: string | null = null;
  let testimonials: Array<{ name: string; text: string; avatar: string }> | null = null;
  let allProducts: Product[] = [];
  try {
    [content, featuredIds, logoUrl, testimonials, allProducts] = await Promise.all([
      fetchSetting<HomepageContent>('homepage_content'),
      fetchSetting<string[]>('featured_products'),
      fetchLogoUrl(),
      fetchSetting<Array<{ name: string; text: string; avatar: string }>>('testimonials'),
      fetchCatalogProducts(),
    ]);
  } catch (e) {
    console.error('Error loading homepage data:', e);
  }

  // Resolve the 6 featured products on the server so the section renders without
  // a client fetch (it no longer calls useProducts).
  const featured = (featuredIds && featuredIds.length > 0
    ? featuredIds.map((id) => allProducts.find((p) => p.id === id)).filter((p): p is Product => !!p)
    : allProducts.filter((p) => p.featured)
  ).slice(0, 6);

  return (
    <>
      <Hero content={content || undefined} logoUrl={logoUrl} />
      <div className="bg-white">
        <ServicesOverview content={content || undefined} />
      </div>
      <FeaturedProducts content={content || undefined} featured={featured} />
      <div className="bg-white">
        <Testimonials testimonials={testimonials || undefined} />
      </div>
      <CTABanner content={content || undefined} />
    </>
  );
}
