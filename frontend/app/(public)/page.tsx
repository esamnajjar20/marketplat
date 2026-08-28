import type { Metadata } from 'next';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HomeQuickActions } from '@/components/home/HomeQuickActions';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { PromotedProductsSection } from '@/components/home/PromotedProductsSection';
import { RecentProductsSection } from '@/components/home/RecentProductsSection';
import { HomeServicesSection } from '@/components/home/HomeServicesSection';
import { FeaturedStoresSection } from '@/components/home/FeaturedStoresSection';
import { RecommendedAds } from '@/components/home/RecommendedAds';
import { LazySection } from '@/components/shared/LazySection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرئيسية', path: '/' });

/**
 * رئيسية مُعاد ترتيبها:
 * 1) Hero + شريط (بحث / دفع / بطاقات)
 * 2) تصنيفات + إعلانات مميزة + أحدث الإعلانات (قلب الاكتشاف)
 * 3) منتجات (عروض ثم أحدث)
 * 4) خدمات (بدل قريب منك)
 * 5) متاجر مميزة
 * 6) مقترح لك (أسفل الصفحة — لا يستبدل المميز/الأحدث)
 */
export default function HomePage() {
  return (
    <div className="pb-8">
      <HeroBanner />
      <HomeQuickActions />

      {/* الإعلانات محور رئيسي فوق الطية */}
      <HomeAboveFold />

      <LazySection minHeight={280} rootMargin="100px 0px">
        <PromotedProductsSection />
      </LazySection>
      <LazySection minHeight={300} rootMargin="80px 0px">
        <RecentProductsSection />
      </LazySection>

      {/* خدمات بدل «قريب منك» */}
      <LazySection minHeight={280} rootMargin="80px 0px">
        <HomeServicesSection />
      </LazySection>

      <LazySection minHeight={280} rootMargin="60px 0px">
        <FeaturedStoresSection />
      </LazySection>

      <LazySection minHeight={260} rootMargin="40px 0px" whenIdle>
        <RecommendedAds />
      </LazySection>
    </div>
  );
}
