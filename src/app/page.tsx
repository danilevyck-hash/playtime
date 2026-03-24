import Hero from '@/components/landing/Hero';
import ServicesOverview from '@/components/landing/ServicesOverview';
import FeaturedProducts from '@/components/landing/FeaturedProducts';
import InstagramFeed from '@/components/landing/InstagramFeed';
import CTABanner from '@/components/landing/CTABanner';

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
