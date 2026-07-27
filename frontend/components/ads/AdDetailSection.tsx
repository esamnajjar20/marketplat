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
import { AdDetail }       from '@/components/ads/AdDetail';
import { RelatedAds }     from '@/components/ads/RelatedAds';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useAd }          from '@/hooks/queries/useAds';
import { useFavorites, useIsFavorited } from '@/hooks/queries/useFavorites';

export function AdDetailSection({ id }: { id: string }) {
  const { data: ad, isLoading } = useAd(id);
  // Warms the shared favorites.ids() Set with the user's full favorites
  // list (up to the backend's max page size) so useIsFavorited below is
  // accurate even for ads beyond page 1. No-ops (query disabled) when
  // the user isn't authenticated — see useFavorites' `enabled` check.
  useFavorites({ limit: 100 });
  const isFavorited = useIsFavorited(id);

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (!ad)       return null;

  return (
    <div className="space-y-8">
      <AdDetail ad={ad} isFavorited={isFavorited} />
      <RelatedAds adId={id} />
    </div>
  );
}
