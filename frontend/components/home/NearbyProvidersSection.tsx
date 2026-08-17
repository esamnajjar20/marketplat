'use client';

import { LocateFixed } from 'lucide-react';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { useNearbyProvidersForHome } from '@/hooks/queries/useNearbyProvidersForHome';
import { ROUTES } from '@/lib/constants';

/**
 * FEAT-HOME-NEARBY-PROVIDERS: "مقدمو خدمات قريبون منك" section for
 * Home. Deliberately self-hiding, not a fixed slot in the page layout
 * — see useNearbyProvidersForHome's own doc for why this never
 * prompts for location on its own. Three states:
 *   1. still checking existing browser permission → render nothing
 *      (no layout jump once the check resolves either way — this is
 *      a silent, near-instant check, not a network request)
 *   2. not granted (denied, prompt, or unsupported) → render nothing;
 *      the only place that ever asks for location explicitly is
 *      /service-providers's own "استخدام موقعي الحالي" button
 *   3. granted → fetch nearby providers and show up to 6, exactly
 *      like NearbyServiceProviders.tsx's own card grid
 *
 * Loading/error/empty states are intentionally minimal (not the full
 * EmptyState treatment /service-providers uses for its own denied/
 * unsupported cases) — those cases can't happen here since this only
 * ever queries once permission is already 'granted'.
 */
export function NearbyProvidersSection() {
  const { show, isChecking, data, isLoading, isError } = useNearbyProvidersForHome();

  if (isChecking || !show) return null;

  const items = data?.items ?? [];

  // Loading or a genuine fetch error with an already-granted
  // permission — show the skeleton grid rather than nothing, so the
  // section doesn't pop in abruptly once data resolves. A real error
  // here (network failure, not a permission issue) just quietly
  // renders nothing further below — no destructive error banner on
  // the homepage for what's a secondary discovery section.
  if (isLoading) {
    return (
      <section className="container mx-auto space-y-4 px-4 pt-10">
        <SectionHeader
          eyebrow="قريبون منك"
          title="مقدمو خدمات قريبون منك"
          icon={<LocateFixed className="h-3.5 w-3.5" />}
          cta={{ href: ROUTES.serviceProviders, label: 'عرض الكل ←' }}
        />
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
      <SectionHeader
        eyebrow="قريبون منك"
        title="مقدمو خدمات قريبون منك"
        icon={<LocateFixed className="h-3.5 w-3.5" />}
        cta={{ href: ROUTES.serviceProviders, label: 'عرض الكل ←' }}
      />
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3">
        {items.map((provider) => (
          <div key={provider.id} className="w-72 shrink-0 sm:w-auto">
            <ServiceProviderCard provider={provider} />
          </div>
        ))}
      </div>
    </section>
  );
}
