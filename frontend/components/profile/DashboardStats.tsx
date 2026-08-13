'use client';

import { useMyAdStats } from '@/hooks/queries/useAds';
import { Eye, Heart, ShoppingBag, TrendingUp, AlertTriangle } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

/**
 * FIX BUG-06/BUG-07 (superseded): both fixes previously worked around
 * the lack of a real aggregate-stats endpoint by requesting the
 * backend's max page size (100) for ads and favorites and reducing
 * them client-side — correct for the overwhelming majority of sellers,
 * but still silently wrong past 100 items, same bug shape as the
 * original default-page-size-of-20 bug, just at a higher ceiling.
 *
 * Now backed by a real server-side aggregate: GET /ads/me/stats runs
 * groupBy/count/sum queries directly (see ads.service.ts's getMyStats
 * and ads.repository.ts's getStatsByUserId), so every number here is
 * exact regardless of how many ads or favorites the user has — no page
 * size to outgrow.
 */
export function DashboardStats() {
  const { data: stats, isLoading, isError, refetch } = useMyAdStats();

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>;

  // UX-FIX P1-11: this is the most silent failure mode found in the
  // whole audit — a failed fetch produced no empty state at all, just
  // every stat quietly computed as 0 via the `?? 0` fallbacks below.
  // A seller would see "0 إعلانات نشطة، 0 مشاهدات" and could reasonably
  // read that as their real numbers rather than "we couldn't load
  // this". Surfacing the failure explicitly, with a retry.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center rounded-lg border">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل الإحصائيات</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const items = [
    // FIX A11Y/UX-01: same fix as AdminStatsGrid — primary/accent
    // instead of stock blue-500/purple-500, so every color here comes
    // from the actual design system tokens.
    { label: 'الإعلانات النشطة', value: stats?.activeAds ?? 0,       icon: ShoppingBag, color: 'text-primary' },
    { label: 'إعلانات تم بيعها', value: stats?.soldAds ?? 0,         icon: TrendingUp,  color: 'text-success' },
    { label: 'إجمالي المشاهدات', value: stats?.totalViews ?? 0,      icon: Eye,         color: 'text-accent' },
    { label: 'المفضلة',          value: stats?.favoritesCount ?? 0,  icon: Heart,       color: 'text-destructive' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-lg border bg-card p-4 space-y-2">
          <Icon className={`h-5 w-5 ${color}`} />
          <p className="text-2xl font-bold">{value.toLocaleString('ar')}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}
