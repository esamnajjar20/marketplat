'use client';

import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { AdCard }         from '@/components/ads/AdCard';
import { UnifiedResultCard } from '@/components/search/UnifiedResultCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState }     from '@/components/shared/feedback/EmptyState';
import { ApiError }       from '@/components/shared/ApiError';
import { Button }         from '@/components/shared/ui/Button';
import { useAdsForHome }  from '@/hooks/queries/useAdsForHome';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES }         from '@/lib/constants';

/**
 * "أحدث الإعلانات" Home section body — heading itself stays owned by
 * HomeAboveFold (the location-source badge lives there, next to
 * SectionHeader, since this component only owns the grid/empty/loading
 * states, matching the pre-existing split between HomeAboveFold's
 * SectionHeader and RecentAds' body).
 *
 * Now location-aware via useAdsForHome (GPS → /search?type=ads&sort=
 * distance, city → /ads?city=, fallback → /ads) instead of always
 * calling the plain unfiltered /ads list. See that hook's own doc for
 * the full priority chain + cascade-on-empty/failure behavior.
 */
export function RecentAds() {
  const { isLoading, isError, items, refetch } = useAdsForHome();
  // FIX P1-10: /ads/create is a protected route — an unauthenticated
  // visitor tapping this CTA was immediately bounced to /login with no
  // warning. Route them to registration/login instead of dangling a
  // link that looks like it publishes an ad but actually interrupts
  // them.
  const isAuth = useAuthStore(selectIsAuthenticated);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <AdCardSkeleton key={i} />)}
      </div>
    );
  }

  // FIX UI-REVIEW-ERROR-STATE: reported bug — on a failed/dead
  // connection this fell straight into the empty-items branch below
  // and told the user "لا توجد إعلانات بعد" (no ads yet), which is
  // actively wrong on an established marketplace and just tells a
  // user with a real connectivity problem to go create the first ad
  // themselves. useAdsForHome's own isError only ever reflects the
  // *final* query in its GPS/city → general cascade (see that hook's
  // doc) — i.e. this only fires once every fallback has also failed,
  // never for a GPS-specific hiccup that a working general query
  // already recovered from.
  if (isError) {
    return <ApiError error={{ message: 'تعذر تحميل الإعلانات.' }} onRetry={refetch} variant="inline" />;
  }

  // FIX (audit note, home page §1): previously returned bare cards with
  // no fallback at all when the list came back empty — a brand-new or
  // freshly-seeded marketplace would show an empty grid with no
  // explanation and no next step. Mirrors the EmptyState pattern used
  // everywhere else in the app (SearchResults, StoresGrid, ...).
  //
  // Note: useAdsForHome already cascades GPS/city → general on an
  // empty result, so items being empty here means even the general
  // query came back empty *without erroring* — a genuinely empty
  // marketplace, not a location-specific gap or a connectivity issue
  // (that's the isError branch above).
  if (items.data.length === 0) {
    return (
      <EmptyState
        icon={<PackageSearch className="h-8 w-8" />}
        title="لا توجد إعلانات بعد"
        description={isAuth ? 'كن أول من ينشر إعلاناً في سوق غزة' : 'سجّل دخولك لتكون أول من ينشر إعلاناً في سوق غزة'}
        action={
          isAuth ? (
            <Button asChild size="sm">
              <Link href={ROUTES.adCreate}>نشر إعلان مجاناً</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              {/* FIX P1-10: label states the reason for the redirect —
                  the guest shouldn't have to guess why they're being sent
                  to login. ?from= already carried the intent; this just
                  makes the button say it too. */}
              <Link href={`${ROUTES.login}?from=${encodeURIComponent(ROUTES.adCreate)}`}>تسجيل الدخول لنشر إعلان</Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-fade-in">
        {items.kind === 'search'
          ? items.data.map((result) => <UnifiedResultCard key={result.id} result={result} />)
          : items.data.map((ad, i) => <AdCard key={ad.id} ad={ad} priority={i < 2} />)}
      </div>
      <div className="flex justify-center">
        <Link href={ROUTES.search}>
          <Button variant="outline">عرض جميع الإعلانات</Button>
        </Link>
      </div>
    </div>
  );
}
