'use client';

/**
 * شريط «قد يعجبك أيضاً» على الرئيسية.
 * يعتمد على مدينة المستخدم عند توفرها — نفس إشارة الترتيب التي يرسلها
 * الـ backend عبر query.city / ملف المستخدم.
 */

import { Sparkle, AlertTriangle, MapPin } from 'lucide-react';
import { AdCard } from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useRecommendations } from '@/hooks/queries/useRecommendations';
import { useAuthStore } from '@/store/auth.store';
import { homeSectionLimit } from '@/lib/listLimits';

/**
 * FIX UX-AUDIT-02: previously `!isLoading && !data?.length` collapsed
 * the section to `null` for a failed fetch exactly the same as a
 * genuinely-empty result — a visitor with a real personalized feed
 * waiting for them on a good connection would see the section quietly
 * vanish on a bad one, with no sign anything went wrong. Every other
 * data section on this page (RecentAds, DashboardStats) surfaces a
 * failed fetch explicitly with a retry; this one didn't. isError now
 * renders a small inline retry, consistent with those, while a true
 * empty result (no error, just nothing to recommend) still disappears
 * as before — that behavior is correct, not the bug.
 */
export function RecommendedAds() {
  const limit = homeSectionLimit(8, 4);
  const city = useAuthStore((s) => s.user?.city?.trim() || undefined);
  const { data, isLoading, isError, refetch } = useRecommendations({
    limit,
    city,
  });

  if (!isLoading && !isError && !data?.length) return null;

  return (
    <section className="container mx-auto space-y-4 px-4 pt-10">
      <div className="flex items-end justify-between gap-3 border-b pb-3">
        <div className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkle className="h-3.5 w-3.5" />
            لك
          </p>
          <h2 className="text-lg font-bold sm:text-xl">قد يعجبك أيضاً</h2>
          {city ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" aria-hidden />
              أولوية لنتائج في {city}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              حدّد مدينتك من الإعدادات لتحسين الاقتراحات
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: limit }).map((_, i) => (
            <AdCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-sm">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          <p className="text-destructive">حدث خطأ أثناء تحميل التوصيات</p>
          <button type="button" onClick={() => refetch()} className="text-primary hover:underline">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-fade-in">
          {data!.map((ad) => (
            <AdCard key={ad.id} ad={ad} />
          ))}
        </div>
      )}
    </section>
  );
}
