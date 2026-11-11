import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { buildMetadata } from '@/lib/seo';
import type { ServiceListingWithProvider } from '@/types/service.types';
import { fetchServerApi, ServerApiHttpError } from '@/lib/server/serverApiFetch';
import { ServiceListingDetail } from '@/components/services/ServiceListingDetail';
import { ServiceRequestButton } from '@/components/services/ServiceRequestButton';
import { ServiceViewTracker } from '@/components/services/ServiceViewTracker';
import { RelatedServices } from '@/components/services/RelatedServices';
import { LazySection } from '@/components/shared/LazySection';
import { ServiceBreadcrumb } from '@/components/services/ServiceBreadcrumb';
import { headers } from 'next/headers';
import { buildServiceJsonLd, safeJsonLd } from '@/lib/structuredData';

interface Props {
  params: Promise<{ id: string }>;
}

const getCachedListing = cache(async (id: string): Promise<ServiceListingWithProvider> => {
  const response = await fetchServerApi<ServiceListingWithProvider>(
    `/service-listings/${encodeURIComponent(id)}`,
    { mode: 'no-store' },
  );
  const listing = response.data;
  // A 200 response without the required provider relation is an API contract
  // failure, not evidence that the listing was deleted.
  if (!listing || typeof listing !== 'object' || !listing.id || !listing.provider?.sellerProfile) {
    throw new Error('Service listing response is incomplete');
  }
  return listing;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const listing = await getCachedListing(id);
    return buildMetadata({ title: listing.title, path: `/services/${id}` });
  } catch {
    return { title: 'خدمة' };
  }
}

export default async function ServiceListingPage({ params }: Props) {
  const { id } = await params;
  let listing: ServiceListingWithProvider | null = null;

  try {
    listing = await getCachedListing(id);
  } catch (err) {
    // Only an HTTP 404 is a confirmed missing listing. Network failures,
    // timeouts, malformed payloads and every other HTTP status must remain
    // visible to the route error boundary so users can retry the request.
    if (err instanceof ServerApiHttpError && [400, 404, 422].includes(err.statusCode)) {
      listing = null;
    } else {
      throw err;
    }
  }

  if (!listing) notFound();

  const providerUserId = listing.provider.sellerProfile?.userId;
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <div className={`container mx-auto max-w-7xl space-y-6 px-4 py-6 ${providerUserId ? 'pb-sticky-contact' : 'pb-8'}`}>
      {/* SW-SEO-JSONLD-SERVICE-01: schema.org Service. Provider is a
          Person (not LocalBusiness) because the marketplace represents
          individual service providers, and the listing payload does
          not carry a business address — a Person with a profile URL
          is what the entity actually is. NEGOTIABLE listings emit no
          Offer (no price to quote). */}
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            buildServiceJsonLd({
              id: listing.id,
              title: listing.title,
              description: listing.description,
              images: listing.images,
              price: listing.price,
              pricingType: listing.pricingType,
              updatedAt: listing.updatedAt,
              provider: {
                displayName: listing.provider.sellerProfile?.displayName,
                userId: listing.provider.sellerProfile?.userId,
                businessName: listing.provider.businessName,
              },
            }),
          ),
        }}
      />
      <ServiceViewTracker serviceListingId={listing.id} categoryId={listing.categoryId} />
      <ServiceBreadcrumb title={listing.title} categoryId={listing.categoryId} />
      <ServiceListingDetail
        listing={listing}
        action={
          providerUserId ? (
            <ServiceRequestButton
              listingId={listing.id}
              providerUserId={providerUserId}
              providerAvailability={listing.provider.availabilityStatus}
            />
          ) : null
        }
      />
      {/* خدمات مشابهة فقط — بدون توصيات إضافية لتخفيف الصفحة */}
      <LazySection minHeight={240} rootMargin="96px 0px" whenIdle>
        <RelatedServices
          serviceListingId={listing.id}
          categoryId={listing.categoryId}
          serviceTypeId={listing.serviceTypeId}
          title="خدمات مشابهة"
        />
      </LazySection>
    </div>
  );
}
