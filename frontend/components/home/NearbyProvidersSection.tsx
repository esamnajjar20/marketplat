'use client';

import { LocateFixed } from 'lucide-react';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { useNearbyProvidersForHome } from '@/hooks/queries/useNearbyProvidersForHome';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { ROUTES } from '@/lib/constants';

/**
 * FEAT-HOME-NEARBY-PROVIDERS: "مقدمو خدمات قريبون منك" section for
 * Home. Phase 4: now driven by useLocationResolver's full priority
 * chain via useNearbyProvidersForHome (gps-current/gps-saved →
 * nearby search; city → Phase 3's city directory; fallback → general
 * unfiltered directory), including a fallback cascade on a failed or
 * empty GPS/city query (see that hook's own doc for the full
 * breakdown) instead of a GPS-only permission check. This section no
 * longer permanently hides for lack of location; it only hides its
 * heading+grid when even the general cascade target genuinely comes
 * back empty (same behavior as FeaturedStoresSection).
 *
 * Loading state renders the same skeleton grid regardless of which
 * source is active, so a resolver transition (e.g. 'checking' →
 * 'city' once city loads) never causes a layout jump.
 *
 * Location badge shows which source actually produced the results
 * currently shown (falls back to "نتائج مقترحة" once
 * useNearbyProvidersForHome itself has cascaded to the general
 * directory, even if the resolver's own source is still
 * 'gps-current'/'city' — the badge reflects what's on screen).
 */
export function NearbyProvidersSection() {
  const { isChecking, data, isLoading, isError, source } = useNearbyProvidersForHome();
  const { city } = useBrowseCity();

  const items = data?.items ?? [];
  const showSkeleton = isChecking || isLoading;
  const badgeCity = source === 'city' ? city : undefined;

  const header = (
    <SectionHeader
      eyebrow="قريبون منك"
      title="مقدمو خدمات في مدينتك"
      icon={<LocateFixed className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.serviceProviders, label: 'عرض الكل ←' }}
      badge={!showSkeleton ? <LocationSourceBadge source={source} city={badgeCity} /> : undefined}
    />
  );

  // Loading covers both the resolver itself settling (isChecking) and
  // the resulting query fetching (isLoading) — shown as one continuous
  // skeleton so there's no flash of nothing while the resolver decides
  // which source to use. A real fetch error just quietly renders
  // nothing further below — no destructive error banner on the
  // homepage for what's a secondary discovery section.
  if (showSkeleton) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3">
        {header}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 sm:w-auto">
              <StoreCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Phase B: skip thin rows that look unfinished on the homepage.
  if (isError || items.length < 3) return null;

  return (
    <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3">
      {header}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3 stagger-fade-in">
        {items.map((provider) => (
          <div key={provider.id} className="w-72 shrink-0 sm:w-auto">
            <ServiceProviderCard provider={provider} />
          </div>
        ))}
      </div>
    </section>
  );
}
