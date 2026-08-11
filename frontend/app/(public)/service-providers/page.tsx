import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { NearbyServiceProviders } from '@/components/services/NearbyServiceProviders';

export const metadata: Metadata = buildMetadata({
  title: 'مقدمو خدمة قريبون منك',
  path: '/service-providers',
});

/**
 * P3 FIX (layout audit §1, "/service-providers بنية مختلفة جذريًا"):
 * this intentionally has no filter sidebar and no grid-cols-4 layout
 * like /stores and /services — it's a different concept, not an
 * unfinished version of theirs. The page (see title/copy above and
 * NearbyServiceProviders) is geolocation-driven — "providers near you"
 * — not a category/city/price browse-and-filter surface, so a filter
 * panel (category, city, sort) wouldn't fit what it's actually doing.
 * Single-column max-w-3xl is deliberate for that same reason.
 */
export default function ServiceProvidersPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <h1 className="text-xl font-semibold">مقدمو خدمة قريبون منك</h1>
      <NearbyServiceProviders />
    </div>
  );
}
