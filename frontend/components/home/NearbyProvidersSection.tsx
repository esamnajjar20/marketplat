'use client';

import { LocateFixed } from 'lucide-react';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { Button } from '@/components/shared/ui/Button';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { useNearbyProvidersForHome } from '@/hooks/queries/useNearbyProvidersForHome';
import { useLocationResolver } from '@/hooks/useLocationResolver';
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
 * GPS CTA + location badge follow the same pattern as HomeAboveFold's
 * Latest Ads section — an explicit "استخدام موقعي" button (never an
 * automatic prompt) shown whenever the resolved source isn't already
 * a live/saved GPS fix, plus a small pill showing which source
 * actually produced the results currently shown (falls back to
 * "نتائج مقترحة" once useNearbyProvidersForHome itself has cascaded
 * to the general directory, even if the resolver's own source is
 * still 'gps-current'/'city' — the badge reflects what's on screen).
 */
export function NearbyProvidersSection() {
  const { isChecking, data, isLoading, isError, source, radiusKm } = useNearbyProvidersForHome();
  const location = useLocationResolver();

  const items = data?.items ?? [];
  const showSkeleton = isChecking || isLoading;
  const badgeCity = source === 'city' ? location.city : undefined;
  const showLocateCta = location.source !== 'gps-current' && location.source !== 'gps-saved';

  const header = (
    <SectionHeader
      eyebrow="قريبون منك"
      title="مقدمو خدمات قريبون منك"
      icon={<LocateFixed className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.serviceProviders, label: 'عرض الكل ←' }}
      badge={!showSkeleton ? <LocationSourceBadge source={source} city={badgeCity} radiusKm={radiusKm} /> : undefined}
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
      <section className="container mx-auto space-y-4 px-4 pt-10">
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

  if (isError || items.length === 0) return null;

  return (
    <section className="container mx-auto space-y-4 px-4 pt-10">
      {header}
      {showLocateCta && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={location.requestLocation}>
          <LocateFixed className="h-3.5 w-3.5" />
          استخدام موقعي
        </Button>
      )}
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
