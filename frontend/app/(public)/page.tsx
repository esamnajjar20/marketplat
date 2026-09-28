import type { Metadata } from 'next';
import { EagerHomeSections } from '@/components/home/EagerHomeSections';
import { TrustLine } from '@/components/home/TrustLine';
import { HomeSafeBuyingTips } from '@/components/home/HomeSafeBuyingTips';
import { HomeGuestPublishBar } from '@/components/home/HomeGuestPublishBar';
import { HomeBrowseLinks } from '@/components/home/HomeBrowseLinks';
import { ForYouMixedSection } from '@/components/home/ForYouMixedSection';
import { RecentProductsSection } from '@/components/home/RecentProductsSection';
import { HomeServicesSection } from '@/components/home/HomeServicesSection';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { PromotedProductsSection } from '@/components/home/PromotedProductsSection';
import { LazySection } from '@/components/shared/LazySection';
import { buildMetadata } from '@/lib/seo';
import { buildHomePageJsonLd, safeJsonLd } from '@/lib/structuredData';

export const metadata: Metadata = buildMetadata({
  title: 'سوق غزة — إعلانات ومنتجات وخدمات',
  description:
    'منصة سوق غزة المحلي: إعلانات مبوبة، منتجات، خدمات، ومتاجر قريبة منك. ابحث، اشترِ، أو اعرض مجاناً — تواصل مباشر بلا وسطاء.',
  path: '/',
});

/**
 * Homepage layout (user brief):
 * 1. Featured mixed carousel (ads / products / stores / services)
 * 2. Mixed categories with type under each chip
 * 3. "For you" mixed recommendations (trending for guests)
 * 4. Per-type horizontal rails with "view all"
 */
export default function HomePage() {
  const jsonLd = buildHomePageJsonLd();

  return (
    <div className="pb-12 sm:pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      {/* 1–2: carousel + categories (+ ads rail in HomeAboveFold) */}
      <EagerHomeSections />

      <div className="mt-6 space-y-8 sm:mt-8 sm:space-y-10">
        {/* 3: personalized / trending mixed */}
        <LazySection minHeight={300} rootMargin="48px 0px" whenIdle>
          <ForYouMixedSection />
        </LazySection>

        {/* 4: type rails */}
        <LazySection minHeight={320} rootMargin="48px 0px" whenIdle>
          <RecentProductsSection />
        </LazySection>

        <LazySection minHeight={300} rootMargin="64px 0px" whenIdle>
          <HomeServicesSection />
        </LazySection>

        <LazySection minHeight={300} rootMargin="64px 0px" whenIdle>
          <FeaturedStoresSection />
        </LazySection>

        <LazySection minHeight={300} rootMargin="80px 0px" whenIdle>
          <PromotedProductsSection />
        </LazySection>

        <LazySection minHeight={300} rootMargin="80px 0px" whenIdle>
          <NearbyProvidersSection />
        </LazySection>
      </div>

      <div className="mt-8 space-y-4 sm:mt-10">
        <HomeSafeBuyingTips />
        <HomeBrowseLinks />
        <TrustLine />
      </div>

      <HomeGuestPublishBar />
    </div>
  );
}
