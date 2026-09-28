'use client';

import { Clock } from 'lucide-react';
import { RecentAds }    from '@/components/home/RecentAds';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useAdsForHome } from '@/hooks/queries/useAdsForHome';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { ROUTES }       from '@/lib/constants';

/**
 * PLAN Phase 1 (خطة الرئيسية المُعدّلة، القسم 4): هذا الملف كان يحمل
 * 3 أقسام منسّقة معًا (فئات + مميزة + حديثة) خلف سقف تحميل واحد
 * (FIX UX-GAP-03 الأصلي). الفئات والمميزة انتقلا إلى CategoriesRow و
 * FeaturedCarousel الجديدين (يُركّبان مباشرة في page.tsx فوق هذا
 * المكوّن)، فلم يعد هناك داعٍ لتنسيق تحميلهما هنا — تبقّى قسم "أحدث
 * الإعلانات" الموعي بالموقع وحده، فبقي بسقف تحميل خاص به (recentChecking
 * || recentLoading) بدل حذف الملف بالكامل، حفاظًا على منطق useAdsForHome/
 * useLocationResolver واللافتة الموقعية كما هو دون إعادة كتابته.
 *
 * CategoryGrid.tsx و FeaturedAds.tsx نفسهما لم يُحذفا من المشروع (قرار
 * الخطة، القسم 4) — لم يعودا مستوردين من هنا فقط. الاستيراد الوحيد
 * المتبقي لهما الآن هو ملفات الاختبار (__tests__/components/CategoryGrid.test.tsx
 * و __tests__/components/home/HomeAboveFold.test.tsx) — هذا الأخير
 * سيفشل الآن لأنه يفترض العرض القديم بثلاثة أقسام؛ يحتاج تحديثًا يدويًا
 * لم يُنفَّذ هنا (لم يتوفر وصول لتشغيل/معاينة الاختبارات في هذه البيئة).
 */

export function HomeAboveFold() {
  const { isChecking: recentChecking, isLoading: recentLoading, source: recentSource } = useAdsForHome();
  const { city } = useBrowseCity();

  const stillLoading = recentChecking || recentLoading;
  const badgeCity = recentSource === 'city' ? city : undefined;

  const latestAdsHeadingLoading = (
    <SectionHeader
      eyebrow="تصفّح"
      title="إعلانات"
      icon={<Clock className="h-3.5 w-3.5" />}
      cta={{ href: `${ROUTES.search}?type=ads`, label: 'عرض الكل ←' }}
    />
  );

  const latestAdsHeadingLoaded = (
    <SectionHeader
      eyebrow="تصفّح"
      title="إعلانات"
      icon={<Clock className="h-3.5 w-3.5" />}
      cta={{ href: `${ROUTES.search}?type=ads`, label: 'عرض الكل ←' }}
      badge={<LocationSourceBadge source={recentSource} city={badgeCity} />}
    />
  );

  if (stillLoading) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-6 sm:pt-8">
        {latestAdsHeadingLoading}
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-[min(72vw,280px)] shrink-0 sm:w-[240px]">
              <AdCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-6 sm:pt-8">
      {latestAdsHeadingLoaded}
      <RecentAds />
    </section>
  );
}
