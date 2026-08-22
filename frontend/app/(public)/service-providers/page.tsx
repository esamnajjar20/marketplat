import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { NearbyServiceProviders } from '@/components/services/NearbyServiceProviders';

export const metadata: Metadata = buildMetadata({
  title: 'مقدمو الخدمة',
  path: '/service-providers',
});

/**
 * P3 FIX (layout audit §1, "/service-providers بنية مختلفة جذريًا"):
 * this intentionally has no filter sidebar and no grid-cols-4 layout
 * like /stores and /services — it's a different concept, not an
 * unfinished version of theirs. Single-column max-w-3xl is deliberate:
 * the page is location-led (see NearbyServiceProviders' gps → city →
 * general cascade), not a category/price browse-and-filter surface,
 * so a filter panel (category, price, sort) wouldn't fit what it's
 * actually doing.
 *
 * NAMING FIX (audit): title/heading previously said "قريبون منك"
 * unconditionally, matching the old GPS-only implementation. Now that
 * the page also serves city- and general-directory results when no
 * GPS fix is available, a hardcoded "near you" heading would misdescribe
 * what's on screen for most visitors. The neutral "مقدمو الخدمة" here
 * matches the BROWSE_LINKS nav label it's linked from; which-source-
 * produced-this copy now lives in NearbyServiceProviders' own
 * LocationSourceBadge instead of the page heading.
 */
export default function ServiceProvidersPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <h1 className="text-xl font-semibold">مقدمو الخدمة</h1>
      <NearbyServiceProviders />
    </div>
  );
}
