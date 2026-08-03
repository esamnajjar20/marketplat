import { Briefcase } from 'lucide-react';
import { ServiceListingCard } from './ServiceListingCard';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import type { ServiceListing, ServiceProviderPublic } from '@/types/service.types';

interface Props {
  provider: ServiceProviderPublic;
  listings: ServiceListing[];
}

/**
 * The public provider page's own GET /service-providers/:id response
 * embeds `listings: ServiceListing[]` (bare, no provider summary on
 * each item — it already knows its own provider). ServiceListingCard
 * expects a ServiceListingWithProvider, so each listing is paired back
 * with the provider info the parent page already has, rather than
 * re-fetching or duplicating provider fields into every listing here.
 */
export function ServiceProviderListings({ provider, listings }: Props) {
  const active = listings.filter((l) => l.status === 'ACTIVE');

  if (active.length === 0) {
    return (
      <EmptyState
        icon={<Briefcase className="h-10 w-10" />}
        title="لا توجد خدمات منشورة"
        description="لم ينشر مقدم الخدمة أي خدمة نشطة بعد"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {active.map((listing) => (
        <ServiceListingCard
          key={listing.id}
          listing={{
            ...listing,
            provider: {
              id: provider.id,
              businessName: provider.businessName,
              logoUrl: provider.logoUrl,
              availabilityStatus: provider.availabilityStatus,
              sellerProfile: {
                userId: provider.sellerProfile.userId,
                displayName: provider.sellerProfile.displayName,
                verified: provider.sellerProfile.verified,
                averageRating: provider.sellerProfile.averageRating,
              },
            },
          }}
        />
      ))}
    </div>
  );
}
