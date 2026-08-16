'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ProfileTabs, type ProfileTabValue } from '@/components/profile/ProfileTabs';
import { PublicProfileAds } from '@/components/profile/PublicProfileAds';
import { ProfileStoreSummary } from '@/components/profile/ProfileStoreSummary';
import { ProfileServiceProviderSummary } from '@/components/profile/ProfileServiceProviderSummary';
import { SellerRatingsList } from '@/components/sellers/SellerRatingsList';
import { ServiceReviewsList } from '@/components/services/ServiceReviewsList';
import { ErrorBoundary } from '@/components/shared/feedback/ErrorBoundary';
import type { PublicUser } from '@/types/user.types';

interface Props { user: PublicUser; }

const TAB_LABEL: Record<ProfileTabValue, string> = {
  overview: 'نظرة عامة',
  ads:      'الإعلانات',
  store:    'المتجر',
  services: 'الخدمات',
  ratings:  'التقييمات',
};

/**
 * UNIFIED-PROFILE: URL-bound (?tab=) tab section for /profile/[id],
 * same pattern as SearchTabsWrapper around SearchTabs — the state lives
 * in the URL rather than component state so a shared/back-navigated
 * link lands on the same tab. Only tabs the profile actually has data
 * for are ever rendered, per the "tabs that don't apply don't show"
 * design: a plain user gets [الإعلانات] [التقييمات] only if they have
 * ads/ratings at all; a seller with a store and services gets the full
 * five.
 *
 * "نظرة عامة" is the default landing tab and — for now — mirrors the
 * ads grid (no separate overview content exists yet to aggregate across
 * sections), so it's only offered as a distinct tab when there's more
 * than one other section to summarize; a plain user with only ads goes
 * straight to the ads tab instead of a redundant duplicate.
 */
export function ProfileTabsSection({ user }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const seller = user.sellerProfile;
  const hasStore = !!seller?.storeDetails;
  const hasServices = !!seller?.serviceProviderDetails;
  const hasRatings = !!seller && (seller.totalRatings > 0 || seller._count.serviceReviews > 0);
  const sectionCount = [true, hasStore, hasServices, hasRatings].filter(Boolean).length;

  const available: ProfileTabValue[] = [
    ...(sectionCount > 1 ? (['overview'] as const) : []),
    'ads',
    ...(hasStore ? (['store'] as const) : []),
    ...(hasServices ? (['services'] as const) : []),
    ...(hasRatings ? (['ratings'] as const) : []),
  ];

  const requested = sp.get('tab') as ProfileTabValue | null;
  // available[0] is either 'overview' (sectionCount > 1) or 'ads' —
  // 'ads' is unconditionally in the array either way, so it's always a
  // safe fallback and lets TS see this as ProfileTabValue, not
  // ProfileTabValue | undefined (array index access can't prove
  // non-emptiness on its own).
  const defaultTab: ProfileTabValue = available[0] ?? 'ads';
  const value: ProfileTabValue =
    requested && available.includes(requested) ? requested : defaultTab;

  function handleChange(next: ProfileTabValue) {
    const params = new URLSearchParams(sp.toString());
    if (next === defaultTab) params.delete('tab');
    else params.set('tab', next);
    params.delete('page');
    router.push(`/profile/${user.id}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className="space-y-4">
      <ProfileTabs
        value={value}
        onChange={handleChange}
        available={available.map((v) => ({ value: v, label: TAB_LABEL[v] }))}
      />

      {(value === 'overview' || value === 'ads') && <PublicProfileAds userId={user.id} />}

      {value === 'store' && seller?.storeDetails && (
        <ProfileStoreSummary store={seller.storeDetails} />
      )}

      {value === 'services' && seller?.serviceProviderDetails && (
        <ProfileServiceProviderSummary provider={seller.serviceProviderDetails} />
      )}

      {value === 'ratings' && seller && (
        <div className="space-y-6">
          {seller.totalRatings > 0 && (
            <ErrorBoundary
              fallback={
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive">
                  تعذّر عرض تقييمات الإعلانات
                </div>
              }
            >
              <SellerRatingsList sellerProfileId={seller.id} baseUrl={`/profile/${user.id}`} />
            </ErrorBoundary>
          )}
          {seller._count.serviceReviews > 0 && (
            <ErrorBoundary
              fallback={
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive">
                  تعذّر عرض تقييمات الخدمات
                </div>
              }
            >
              <ServiceReviewsList sellerProfileId={seller.id} />
            </ErrorBoundary>
          )}
        </div>
      )}
    </div>
  );
}
