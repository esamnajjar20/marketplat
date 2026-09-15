import type { Metadata } from 'next';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HomeTrustStrip } from '@/components/home/HomeTrustStrip';
import { HomeQuickActions } from '@/components/home/HomeQuickActions';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { PromotedProductsSection } from '@/components/home/PromotedProductsSection';
import { RecentProductsSection } from '@/components/home/RecentProductsSection';
import { HomeServicesSection } from '@/components/home/HomeServicesSection';
import { NearbyProvidersSection } from '@/components/home/NearbyProvidersSection';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { RecommendedAds } from '@/components/home/RecommendedAds';
import { LazySection } from '@/components/shared/LazySection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرئيسية', path: '/' });

/**
 * الرئيسية — تدفق مريح:
 * 1) ترحيب واضح + إجراءان
 * 2) أدوات شخصية (محفوظات / تنزيلات)
 * 3) ثقة مختصرة
 * 4) تصنيفات → مميز → أحدث
 * 5) اقتراحات حسب المدينة
 * 6) منتجات / خدمات / متاجر (تحت الطية)
 */
export default function HomePage() {
  return (
    <div className="pb-12 sm:pb-16">
      <HeroBanner />

      <div className="space-y-5 sm:space-y-7">
        <HomeQuickActions />
        <HomeTrustStrip />
      </div>

      {/* اكتشاف أساسي */}
      <div className="mt-2">
        <HomeAboveFold />
      </div>

      {/* اقتراحات شخصية — أقرب للمستخدم بعد الإعلانات */}
      <div className="mt-2">
        <LazySection minHeight={240} rootMargin="80px 0px">
          <RecommendedAds />
        </LazySection>
      </div>

      {/* بقية الاكتشاف — أبعد قليلًا لتقليل الإرهاق */}
      <div className="mt-4 space-y-1 sm:mt-6">
        <LazySection minHeight={260} rootMargin="100px 0px">
          <NearbyProvidersSection />
        </LazySection>
        <LazySection minHeight={260} rootMargin="100px 0px">
          <PromotedProductsSection />
        </LazySection>
        <LazySection minHeight={280} rootMargin="80px 0px">
          <RecentProductsSection />
        </LazySection>
        <LazySection minHeight={260} rootMargin="80px 0px">
          <HomeServicesSection />
        </LazySection>
        <LazySection minHeight={260} rootMargin="60px 0px">
          <FeaturedStoresSection />
        </LazySection>
      </div>
    </div>
  );
}
