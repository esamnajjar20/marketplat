import type { Metadata } from 'next';
import { cache } from 'react';
import { buildMetadata } from '@/lib/seo';
import { serviceListingsApi } from '@/api/service-listings.api';
import { ServiceListingDetail } from '@/components/services/ServiceListingDetail';

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

  if (!listing) {
    return <div className="text-center py-20 text-muted-foreground">الخدمة غير موجودة</div>;
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
      <ServiceListingDetail listing={listing} />
      {/* زر إرسال طلب سيُضاف في المرحلة 3 (ServiceRequestButton) — غير متوفر بعد */}
    </div>
  );
}
