'use client';

/**
 * FIX INTEG-10: AdDetail.tsx accepts an `isFavorited` prop (defaulting
 * to false) and useIsFavorited() was fully implemented and covered by
 * its own 5-case test suite, but this — the only real caller of
 * AdDetail — never called the hook or passed the prop through. Every
 * ad detail page always rendered the heart as "not saved" on first
 * load, even for ads the user had already favorited.
 *
 * UX-FIX (frontend audit P2-03): previously seeded the shared
 * favorites.ids() Set via useFavorites({ limit: 100 }) — the backend's
 * max page size — fetching the user's entire favorites list just to
 * check one ad, and silently wrong for any ad favorited past page 1 of
 * >100 favorites. Now uses useFavoriteCheck(id), backed by the real
 * GET /favorites/:adId/check endpoint, which seeds the same Set with
 * just this one ad's id if favorited — useIsFavorited() below still
 * reads that Set exactly as before, so toggling stays in sync the same
 * way it always did.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { AdDetail }       from '@/components/ads/AdDetail';
import { AdBreadcrumb }   from '@/components/ads/AdBreadcrumb';
import { RelatedAds }     from '@/components/ads/RelatedAds';
import { AdDetailsSkeleton } from '@/components/shared/skeletons';
import { EmptyState }     from '@/components/shared/feedback/EmptyState';
import { useAd }          from '@/hooks/queries/useAds';
import { useFavoriteCheck, useIsFavorited } from '@/hooks/queries/useFavorites';
import { parseApiError }  from '@/lib/errorParser';
import { ROUTES }         from '@/lib/constants';
import { track }          from '@/lib/analytics';
import { SearchX, AlertTriangle } from 'lucide-react';

export function AdDetailSection({ id }: { id: string }) {
  const { data: ad, isLoading, isError, error, refetch } = useAd(id);
  // Warms the shared favorites.ids() Set with just this ad's status —
  // no-ops (query disabled) when the user isn't authenticated, same as
  // useFavorites' `enabled` check.
  useFavoriteCheck(id);
  const isFavorited = useIsFavorited(id);

  // Gap #7 (product analytics): fires once per successful ad load —
  // dependent on ad.id (not just `ad`) so it doesn't re-fire on every
  // refetch/refresh of the same ad's data (e.g. a favorites toggle
  // invalidating this query), only when the visitor actually lands on
  // a (possibly different) ad.
  useEffect(() => {
    if (ad?.id) track('AD_VIEW', { adId: ad.id, categoryId: ad.category?.id });
  }, [ad?.id, ad?.category?.id]);

  // UX-FIX: route-level loading.tsx already shows AdDetailsSkeleton
  // during the initial server navigation, but any client-side refetch
  // of useAd() (e.g. this query going stale/invalidated while the user
  // is still on the page) fell back to a plain centered LoadingSpinner
  // that wiped the whole layout — a jarring mismatch with the richer
  // skeleton the user already saw once. Same skeleton both times.
  // role="status"/aria-live/aria-busy added here (AdDetailsSkeleton's
  // own internals stay aria-hidden, matching loading.tsx's usage) so
  // screen-reader users still get a "loading" announcement, same as
  // the LoadingSpinner this replaces.
  if (isLoading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">جارٍ تحميل الإعلان…</span>
        <AdDetailsSkeleton />
      </div>
    );
  }

  // UX-FIX P0-1: this used to be `if (!ad) return null;`, which fired
  // on *any* fetch failure — network blip, 500, or a genuinely deleted
  // ad — and rendered a completely blank page with no message and no
  // way to recover. Splitting on statusCode lets a real 404 (ad doesn't
  // exist / was removed) show a distinct "not found" message with a
  // way back to browsing, while every other failure (network, 5xx)
  // gets the same recoverable retry pattern already used in
  // SearchResults/ServiceListingsGrid, since retrying might actually work.
  if (isError || !ad) {
    const status = isError ? parseApiError(error).statusCode : 404;

    if (status === 404) {
      return (
        <EmptyState
          icon={<SearchX className="h-10 w-10" />}
          title="الإعلان غير موجود"
          description="ربما تم حذف هذا الإعلان أو أن الرابط غير صحيح"
          action={
            <Link
              href={ROUTES.search}
              prefetch={false}
              className="text-sm text-primary hover:underline"
            >
              تصفح الإعلانات
            </Link>
          }
        />
      );
    }

    return (
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" />}
        title="حدث خطأ أثناء تحميل الإعلان"
        description="تعذّر تحميل تفاصيل هذا الإعلان، حاول مرة أخرى"
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm text-primary hover:underline"
          >
            إعادة المحاولة
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <AdBreadcrumb ad={ad} />
      <AdDetail ad={ad} isFavorited={isFavorited} />
      <RelatedAds adId={id} />
    </div>
  );
}
