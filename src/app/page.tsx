import Hero from '@/components/landing/Hero';
import ServicesOverview from '@/components/landing/ServicesOverview';
import FeaturedProducts from '@/components/landing/FeaturedProducts';
import CTABanner from '@/components/landing/CTABanner';

export default function Home() {
  return (
    <>
      <Hero />
      <ServicesOverview />
      <FeaturedProducts />
      <CTABanner />
    </>
  );
}
