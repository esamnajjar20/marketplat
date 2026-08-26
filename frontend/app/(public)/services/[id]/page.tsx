import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { serviceListingsApi } from '@/api/service-listings.api';
import { ServiceListingDetail } from '@/components/services/ServiceListingDetail';
import { ServiceRequestButton } from '@/components/services/ServiceRequestButton';
import { ServiceViewTracker } from '@/components/services/ServiceViewTracker';
import { ServiceRecommendations } from '@/components/recommendations/ServiceRecommendations';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ROUTES } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

// Same reasoning as sellers/[id]/page.tsx's getCachedSeller: memoizes
// within a single render pass so generateMetadata and the page body
// don't each fire their own network request for the same listing.
const getCachedListing = cache((id: string) => serviceListingsApi.getById(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const listing = await getCachedListing(id);
    return buildMetadata({ title: listing.data.data!.title, path: `/services/${id}` });
  } catch {
    return { title: 'خدمة' };
  }
}

export default async function ServiceListingPage({ params }: Props) {
  const { id } = await params;
  let listing: Awaited<ReturnType<typeof serviceListingsApi.getById>>['data']['data'] | null = null;

  try {
    const res = await getCachedListing(id);
    listing = res.data.data ?? null;
  } catch {
    /* 404 */
  }

  // P1 FIX (layout audit §3): was a bare centered line of muted text
  // with no icon and no way back — one of the three inconsistent
  // "not found" treatments the audit flagged. Now matches the
  // EmptyState pattern already used by /stores/[id] and /ads/[id].
  if (!listing) {
    return (
      <div className="container mx-auto px-4 py-6">
        <EmptyState
          icon={<SearchX className="h-10 w-10" />}
          title="الخدمة غير موجودة"
          description="ربما تم حذف هذه الخدمة أو أن الرابط غير صحيح"
          action={
            <Link href={ROUTES.services} className="text-sm text-primary hover:underline">
              تصفح الخدمات
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
      {/* PR4A: render-nothing tracker, see ServiceViewTracker.tsx's own
          comment for why this can't just be a useEffect inline here —
          this file is a Server Component. */}
      <ServiceViewTracker serviceListingId={listing.id} categoryId={listing.categoryId} />
      <ServiceListingDetail
        listing={listing}
        action={
          <ServiceRequestButton
            listingId={listing.id}
            providerUserId={listing.provider.sellerProfile.userId}
          />
        }
      />
      <ServiceRecommendations excludeServiceListingId={listing.id} />
    </div>
  );
}
