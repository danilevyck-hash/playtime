import type { Metadata } from 'next';
import Hero from '@/components/landing/Hero';
import ServicesOverview from '@/components/landing/ServicesOverview';
import FeaturedProducts from '@/components/landing/FeaturedProducts';
import InstagramFeed from '@/components/landing/InstagramFeed';
import CTABanner from '@/components/landing/CTABanner';

export const metadata: Metadata = {
  title: 'Fiestas Infantiles en Panam\u00e1 | PlayTime',
  description: 'Organizamos fiestas infantiles completas en Panam\u00e1: animaci\u00f3n, inflables, gymboree, snacks y manualidades. Dise\u00f1amos tu evento y lo llevamos hasta tu puerta.',
};

export default function Home() {
  return (
    <>
      <Hero />
      <ServicesOverview />
      <FeaturedProducts />
      <InstagramFeed />
      <CTABanner />
    </>
  );
}
