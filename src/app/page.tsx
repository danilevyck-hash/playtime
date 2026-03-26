import type { Metadata } from 'next';
import { fetchSetting, fetchLogoUrl } from '@/lib/supabase-data';
import Hero from '@/components/landing/Hero';
import ServicesOverview from '@/components/landing/ServicesOverview';
import FeaturedProducts from '@/components/landing/FeaturedProducts';
import InstagramFeed from '@/components/landing/InstagramFeed';
import CTABanner from '@/components/landing/CTABanner';

export const metadata: Metadata = {
  title: 'Fiestas Infantiles en Panam\u00e1 | PlayTime',
  description: 'Organizamos fiestas infantiles completas en Panam\u00e1: animaci\u00f3n, inflables, gymboree, snacks y manualidades. Dise\u00f1amos tu evento y lo llevamos hasta tu puerta.',
};

interface HomepageContent {
  hero_title?: string;
  hero_subtitle?: string;
  hero_cta_primary?: string;
  hero_cta_secondary?: string;
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
  try {
    [content, featuredIds, logoUrl] = await Promise.all([
      fetchSetting<HomepageContent>('homepage_content'),
      fetchSetting<string[]>('featured_products'),
      fetchLogoUrl(),
    ]);
  } catch {}

  return (
    <>
      <Hero content={content || undefined} logoUrl={logoUrl} />
      <ServicesOverview content={content || undefined} />
      <FeaturedProducts content={content || undefined} featuredIds={featuredIds || undefined} />
      <InstagramFeed />
      <CTABanner content={content || undefined} />
    </>
  );
}
