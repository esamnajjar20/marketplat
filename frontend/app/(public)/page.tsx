import type { Metadata } from 'next';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { PromotedProductsSection } from '@/components/home/PromotedProductsSection';
import { RecentProductsSection } from '@/components/home/RecentProductsSection';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { RecommendedAds } from '@/components/home/RecommendedAds';
import { LazySection } from '@/components/shared/LazySection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرئيسية', path: '/' });

export default function HomePage() {
  return (
    <div className="pb-8">
      <HeroBanner />
      <HomeAboveFold />
      <LazySection minHeight={280}><PromotedProductsSection /></LazySection>
      <LazySection minHeight={300}><RecentProductsSection /></LazySection>
      <LazySection minHeight={280}><NearbyProvidersSection /></LazySection>
      <LazySection minHeight={280}><FeaturedStoresSection /></LazySection>
      <LazySection minHeight={260}><RecommendedAds /></LazySection>
    </div>
  );
}
