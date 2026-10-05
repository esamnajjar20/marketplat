import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { serviceListingsApi } from '@/api/service-listings.api';
import { ServiceListingDetail } from '@/components/services/ServiceListingDetail';
import { ServiceRequestButton } from '@/components/services/ServiceRequestButton';
import { ServiceViewTracker } from '@/components/services/ServiceViewTracker';
import { RelatedServices } from '@/components/services/RelatedServices';
import { ServiceBreadcrumb } from '@/components/services/ServiceBreadcrumb';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ROUTES } from '@/lib/constants';
import { headers } from 'next/headers';
import { buildServiceJsonLd, safeJsonLd } from '@/lib/structuredData';

interface Props {
  params: Promise<{ id: string }>;
}

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
  let listing: Awaited<ReturnType<typeof serviceListingsApi.getById>>['data']['data'] | null =
    null;

  try {
    const res = await getCachedListing(id);
    listing = res.data.data ?? null;
  } catch {
    /* 404 */
  }

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

  const providerUserId = listing.provider.sellerProfile?.userId;
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-3 py-4 sm:px-4 sm:py-6">
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
      <RelatedServices
        serviceListingId={listing.id}
        categoryId={listing.categoryId}
        serviceTypeId={listing.serviceTypeId}
        title="خدمات مشابهة"
      />
    </div>
  );
}
