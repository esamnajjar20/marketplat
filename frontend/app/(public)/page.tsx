import type { Metadata } from 'next';
import { WelcomeBar } from '@/components/home/WelcomeBar';
import { FeaturedCarousel } from '@/components/home/FeaturedCarousel';
import { CategoriesRow } from '@/components/home/CategoriesRow';
import { TrustLine } from '@/components/home/TrustLine';
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
 * PLAN Phase 1 (خطة الرئيسية المُعدّلة، القسم 4): HeroBanner (نصّي بلا
 * صور) + HomeQuickActions + HomeTrustStrip (3 بطاقات) استُبدلت بطبقة
 * Discover حقيقية — WelcomeBar + FeaturedCarousel (مختلط) +
 * CategoriesRow (مختلط) — فوق الطية، بدون تأجيل. الكود القديم بقي في
 * المشروع (لم يُحذف)، فقط لم يعد مستوردًا هنا.
 *
 * HomeAboveFold تقلّص هنا ليحمل قسم "أحدث الإعلانات" الموعي بالموقع
 * فقط (كان يحمل أيضًا CategoryGrid/FeaturedAds، وهما الآن مغطّيان
 * بالمكوّنين الجديدين أعلاه) — انظر تعليق الملف نفسه.
 */
export default function HomePage() {
  return (
    <div className="pb-12 sm:pb-16">
      <WelcomeBar />

      <div className="container mx-auto max-w-7xl space-y-4 px-4 pt-3">
        <FeaturedCarousel />
        <CategoriesRow />
      </div>

      {/* اكتشاف أساسي — فوق الطية، بدون تأجيل */}
      <div className="mt-2">
        <HomeAboveFold />
      </div>

      {/* تحت الطية: تأجيل أقوى على النت البطيء (LazySection يضيّق rootMargin) */}
      <div className="mt-2">
        <LazySection minHeight={240} rootMargin="48px 0px" whenIdle>
          <RecommendedAds />
        </LazySection>
      </div>

      <div className="mt-4 space-y-1 sm:mt-6">
        <LazySection minHeight={260} rootMargin="48px 0px" whenIdle>
          <NearbyProvidersSection />
        </LazySection>
        <LazySection minHeight={260} rootMargin="64px 0px" whenIdle>
          <PromotedProductsSection />
        </LazySection>
        <LazySection minHeight={280} rootMargin="64px 0px" whenIdle>
          <RecentProductsSection />
        </LazySection>
        <LazySection minHeight={260} rootMargin="80px 0px" whenIdle>
          <HomeServicesSection />
        </LazySection>
        <LazySection minHeight={260} rootMargin="80px 0px" whenIdle>
          <FeaturedStoresSection />
        </LazySection>
      </div>

      <TrustLine className="mt-4" />
    </div>
  );
}
