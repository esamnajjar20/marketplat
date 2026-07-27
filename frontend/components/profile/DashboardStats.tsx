'use client';

import { useMyAds }      from '@/hooks/queries/useAds';
import { useFavorites }  from '@/hooks/queries/useFavorites';
import { Eye, Heart, ShoppingBag, TrendingUp } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

/**
 * FIX BUG-06: useMyAds() with no params sent no `limit`, so the backend
 * fell back to its default of 20 — every stat below (active/sold count,
 * total views) was silently computed from only the user's first 20 ads,
 * with no test exercising more than that. There's no dedicated
 * aggregate-stats endpoint for a regular user (unlike admin's
 * getStats()), so this requests the backend's actual max page size
 * (100, enforced by getAdsSchema) instead of its default. A seller
 * with more than 100 ads is not fully covered by this fix — that would
 * need a real server-side aggregate endpoint — but it closes the gap
 * for the overwhelming majority of sellers today.
 *
 * FIX BUG-07: favCount read `favorites?.items?.length` — the length of
 * whatever page was fetched (also capped at the default limit) — instead
 * of the real total from `favorites?.data.meta.total`. Same bug pattern
 * as BUG-06, just left unfixed here: a user with more favorites than fit
 * on one page saw an undercount. Fixed to request the max page size (for
 * consistency with myAds above) and read the true total from meta.
 */
const MAX_ADS_FOR_STATS = 100;

export function DashboardStats() {
  const { data: myAds,    isLoading: adsLoading }  = useMyAds({ limit: MAX_ADS_FOR_STATS });
  const { data: favorites, isLoading: favLoading } = useFavorites({ limit: MAX_ADS_FOR_STATS });

  if (adsLoading || favLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>;

  const activeAds  = myAds?.items?.filter((a) => a.status === 'ACTIVE').length  ?? 0;
  const soldAds    = myAds?.items?.filter((a) => a.status === 'SOLD').length    ?? 0;
  const totalViews = myAds?.items?.reduce((sum, a) => sum + a.views, 0) ?? 0;
  const favCount   = favorites?.meta?.total ?? 0;

  const stats = [
    // FIX A11Y/UX-01: same fix as AdminStatsGrid — primary/accent
    // instead of stock blue-500/purple-500, so every color here comes
    // from the actual design system tokens.
    { label: 'الإعلانات النشطة', value: activeAds,  icon: ShoppingBag, color: 'text-primary' },
    { label: 'إعلانات تم بيعها', value: soldAds,    icon: TrendingUp,  color: 'text-success' },
    { label: 'إجمالي المشاهدات', value: totalViews, icon: Eye,         color: 'text-accent' },
    { label: 'المفضلة',          value: favCount,   icon: Heart,       color: 'text-destructive' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-lg border bg-card p-4 space-y-2">
          <Icon className={`h-5 w-5 ${color}`} />
          <p className="text-2xl font-bold">{value.toLocaleString('ar')}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}
