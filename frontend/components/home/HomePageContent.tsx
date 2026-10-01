'use client';

import { EagerHomeSections } from '@/components/home/EagerHomeSections';
import { HomeAppPromo } from '@/components/home/HomeAppPromo';
import { HomeBrowseLinks } from '@/components/home/HomeBrowseLinks';
import { HomeSafeBuyingTips } from '@/components/home/HomeSafeBuyingTips';
import { HomeGuestPublishBar } from '@/components/home/HomeGuestPublishBar';
import { ForYouMixedSection } from '@/components/home/ForYouMixedSection';
import { RecentProductsSection } from '@/components/home/RecentProductsSection';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { HomeServicesSection } from '@/components/home/HomeServicesSection';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { PromotedProductsSection } from '@/components/home/PromotedProductsSection';
import { HomeBusyBoundary } from '@/components/home/HomeBusyBoundary';
import { LazySection } from '@/components/shared/LazySection';

/**
 * Homepage stack (Marketplace-first discovery):
 * 1. Above-fold (hero + ⭐ featured)
 * 2. 🎯 مخصص لك  — immediately after paid
 * 3. 🛍 أحدث المنتجات
 * 4. 📢 أحدث الإعلانات
 * 5. 🔧 أحدث الخدمات
 * 6. 🏪 أحدث المتاجر
 * 7. 📍 بالقرب منك
 * 8. 🔥 الأكثر ترويجًا (end)
 * 9. Trust / tips
 */
export function HomePageContent() {
  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-16 md:pb-16">
      <HomeBusyBoundary>
        <EagerHomeSections />

        <div className="mt-3 space-y-5 sm:mt-6 sm:space-y-8">
          {/* 🎯 right after paid featured */}
          <LazySection minHeight={240} rootMargin="20px 0px" whenIdle={false}>
            <ForYouMixedSection />
          </LazySection>

          <LazySection minHeight={240} rootMargin="40px 0px" whenIdle>
            <RecentProductsSection />
          </LazySection>

          {/* 📢 ads below For You + products */}
          <LazySection minHeight={240} rootMargin="40px 0px" whenIdle>
            <HomeAboveFold />
          </LazySection>

          <LazySection minHeight={240} rootMargin="48px 0px" whenIdle>
            <HomeServicesSection />
          </LazySection>

          <LazySection minHeight={240} rootMargin="56px 0px" whenIdle>
            <FeaturedStoresSection />
          </LazySection>

          <LazySection minHeight={220} rootMargin="64px 0px" whenIdle>
            <NearbyProvidersSection />
          </LazySection>

          {/* 🔥 most promoted — last commercial rail */}
          <LazySection minHeight={220} rootMargin="80px 0px" whenIdle>
            <PromotedProductsSection />
          </LazySection>
        </div>

        <div className="mx-auto mt-5 max-w-7xl space-y-3 px-3 sm:mt-10 sm:space-y-4 sm:px-4">
          <HomeAppPromo />
          <HomeSafeBuyingTips />
          <HomeBrowseLinks />
        </div>
      </HomeBusyBoundary>

      <HomeGuestPublishBar />
    </div>
  );
}
