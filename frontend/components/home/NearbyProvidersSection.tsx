'use client';

import Link from 'next/link';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import { useNearbyServiceProvidersIfGranted } from '@/hooks/queries/useNearbyServiceProvidersIfGranted';
import { ROUTES } from '@/lib/constants';

/**
 * Plan §6/§7: "مقدمو الخدمات القريبون" home rail. Deliberately renders
 * nothing — no heading either — unless geolocation permission is
 * already 'granted' from a prior visit AND a position + at least one
 * nearby provider actually resolves. That covers:
 *   - permission is 'prompt' or 'denied' or unsupported → section
 *     absent, no popup, no error, no CTA nagging for location
 *   - permission 'granted' but still resolving position/data →
 *     section absent (no visible skeleton) rather than a flash of
 *     empty space before the rest of Home settles
 *   - permission 'granted', request fails → section absent rather
 *     than surfacing an error for a section the visitor never asked
 *     to see (unlike RecommendedAds, which the visitor implicitly
 *     asked for just by being logged in)
 *   - permission 'granted', resolves, zero providers within range →
 *     section absent, same reasoning
 * This is the one section on Home that hides on error, not just on
 * empty — because unlike Ads/Products/Stores, nothing on Home invites
 * the visitor to expect this section exists in the first place.
 */
export function NearbyProvidersSection() {
  const { available, isChecking, data, isLoading, isError } = useNearbyServiceProvidersIfGranted();

  if (!available || isChecking || isLoading || isError) return null;

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <section className="container mx-auto space-y-4 px-4 pt-10">
      <div className="flex items-end justify-between gap-3 border-b pb-3">
        <div className="space-y-0.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">قريبون منك</p>
          <h2 className="text-lg font-bold sm:text-xl">مقدمو الخدمات القريبون</h2>
        </div>
        <Link href={ROUTES.serviceProviders} className="shrink-0 text-sm font-medium text-primary hover:underline">
          عرض الكل ←
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
        {items.map((provider) => (
          <ServiceProviderCard key={provider.id} provider={provider} className="w-64 shrink-0 sm:w-auto" />
        ))}
      </div>
    </section>
  );
}
