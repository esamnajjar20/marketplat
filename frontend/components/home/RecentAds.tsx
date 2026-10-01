'use client';

import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { AdCard }         from '@/components/ads/AdCard';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState }     from '@/components/shared/feedback/EmptyState';
import { ApiError }       from '@/components/shared/ApiError';
import { Button }         from '@/components/shared/ui/Button';
import { useAdsForHome }  from '@/hooks/queries/useAdsForHome';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES }         from '@/lib/constants';

/**
 * "أحدث الإعلانات" — body only; heading stays in HomeAboveFold.
 * Location: profile city via useAdsForHome (no GPS / search-distance).
 */
export function RecentAds() {
  const { isLoading, isError, error, items, refetch } = useAdsForHome();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const { city, setCity, canChange } = useBrowseCity();

  if (isLoading) {
    return (
      <HomeScrollRail>
        {Array.from({ length: 6 }).map((_, i) => (
          <HomeScrollRailItem key={i} size="wide">
            <AdCardSkeleton />
          </HomeScrollRailItem>
        ))}
      </HomeScrollRail>
    );
  }

  if (isError) {
    return <ApiError error={error} onRetry={refetch} variant="inline" />;
  }

  if (items.data.length === 0) {
    const cityEmpty = Boolean(city);
    return (
      <EmptyState
        icon={<PackageSearch className="h-8 w-8" />}
        title={cityEmpty ? `لا إعلانات في ${city}` : 'لا توجد إعلانات بعد'}
        description={
          cityEmpty
            ? 'جرّب عرض كل المدن أو نشر أول إعلان في مدينتك.'
            : isAuth
              ? 'كن أول من ينشر إعلاناً في سوق غزة'
              : 'سجّل دخولك لتكون أول من ينشر إعلاناً في سوق غزة'
        }
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            {cityEmpty && canChange ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setCity(undefined)}>
                عرض كل غزة
              </Button>
            ) : null}
            {isAuth ? (
              <Button asChild size="sm">
                <Link href={ROUTES.adCreate}>نشر إعلان مجاناً</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href={`${ROUTES.login}?from=${encodeURIComponent(ROUTES.adCreate)}`}>
                  تسجيل الدخول لنشر إعلان
                </Link>
              </Button>
            )}
          </div>
        }
      />
    );
  }

  return (
    <HomeScrollRail className="stagger-fade-in">
      {items.data.map((ad, i) => (
        <HomeScrollRailItem key={ad.id} size="wide">
          <AdCard ad={ad} priority={i < 2} density="compact" />
        </HomeScrollRailItem>
      ))}
    </HomeScrollRail>
  );
}
