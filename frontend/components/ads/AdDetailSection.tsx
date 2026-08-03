'use client';

/**
 * FIX INTEG-10: AdDetail.tsx accepts an `isFavorited` prop (defaulting
 * to false) and useIsFavorited() was fully implemented and covered by
 * its own 5-case test suite, but this — the only real caller of
 * AdDetail — never called the hook or passed the prop through. Every
 * ad detail page always rendered the heart as "not saved" on first
 * load, even for ads the user had already favorited.
 *
 * FIX H-BUG-01: useIsFavorited() only ever reads whatever's already in
 * the favorites.ids() cache — it never fetches anything itself. If the
 * user hadn't separately paged through their full favorites list this
 * session, and the favorited ad wasn't on page 1, the Set never
 * contained its id and the heart showed "not saved" even for a genuinely
 * favorited ad. There's no per-ad check endpoint (removed per FIX H-05),
 * so this now also calls useFavorites({ limit: 100 }) — the backend's
 * max page size — so visiting any ad detail page while authenticated
 * warms the Set with the user's complete favorites, not just page 1.
 */
import Link from 'next/link';
import { AdDetail }       from '@/components/ads/AdDetail';
import { AdBreadcrumb }   from '@/components/ads/AdBreadcrumb';
import { RelatedAds }     from '@/components/ads/RelatedAds';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState }     from '@/components/shared/feedback/EmptyState';
import { useAd }          from '@/hooks/queries/useAds';
import { useFavorites, useIsFavorited } from '@/hooks/queries/useFavorites';
import { parseApiError }  from '@/lib/errorParser';
import { ROUTES }         from '@/lib/constants';
import { SearchX, AlertTriangle } from 'lucide-react';

export function AdDetailSection({ id }: { id: string }) {
  const { data: ad, isLoading, isError, error, refetch } = useAd(id);
  // Warms the shared favorites.ids() Set with the user's full favorites
  // list (up to the backend's max page size) so useIsFavorited below is
  // accurate even for ads beyond page 1. No-ops (query disabled) when
  // the user isn't authenticated — see useFavorites' `enabled` check.
  useFavorites({ limit: 100 });
  const isFavorited = useIsFavorited(id);

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;

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
            <Link href={ROUTES.search} className="text-sm text-primary hover:underline">
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
