import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Button } from '@/components/shared/ui/Button';
import { getAvatarUrl } from '@/lib/cloudinary';
import { ROUTES } from '@/lib/constants';
import type { PublicProfileServiceProvider } from '@/types/user.types';
import type { ServiceAvailability } from '@/types/service.types';

interface Props {
  provider: PublicProfileServiceProvider;
  /**
   * FEAT-PROVIDER-PUBLISH-AD: true only when the profile being viewed
   * is the logged-in user's own — set by the caller (ProfileTabsSection
   * already knows this from user.id vs the authed user), not derived
   * here. This card's provider prop has no userId of its own to check
   * (see PublicProfileServiceProvider — deliberately excludes it,
   * same public-profile-safe field set as ProfileStoreSummary).
   */
  isOwnProvider?: boolean;
}

const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

// Same three-state semantic-token map as ServiceProviderHeader.tsx /
// ServiceListingCard.tsx — kept identical rather than re-deriving.
const AVAILABILITY_DOT: Record<ServiceAvailability, string> = {
  AVAILABLE: 'bg-success',
  BUSY: 'bg-warning',
  UNAVAILABLE: 'bg-muted-foreground',
};

/**
 * UNIFIED-PROFILE: summary card for the profile's "الخدمات" tab. Same
 * reasoning as ProfileStoreSummary.tsx — contactPhone and the full
 * listings grid stay on the dedicated /service-providers/[id] page,
 * this card only surfaces the public-profile-safe fields and links
 * through to the real thing.
 *
 * FEAT-PROVIDER-PUBLISH-AD: the one exception is the owner-only
 * "نشر إعلان" button below — same entry-point-only pattern as
 * StoreHeader's, linking straight to the existing /ads/create +
 * CreateAdGate flow. The ad itself stays Ad.sellerProfileId, never a
 * ServiceProviderDetails-owned column (no such column exists).
 * Deliberately no availabilityStatus gate: AVAILABLE/BUSY/UNAVAILABLE
 * reflects booking availability for service requests, not account
 * standing, so it has no bearing on ad-publishing eligibility.
 */
export function ProfileServiceProviderSummary({ provider, isOwnProvider }: Props) {
  const logo = getAvatarUrl(provider.logoUrl ?? '', 96);

  return (
    <div className="space-y-3">
      <Link
        href={ROUTES.serviceProvider(provider.id)}
        className="block rounded-xl border bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md p-4"
      >
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14 rounded-full overflow-hidden bg-muted shrink-0 border">
            <SafeImage variant="avatar" src={logo} alt={provider.businessName} fill className="object-cover" sizes="56px" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{provider.businessName}</h3>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <span className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[provider.availabilityStatus]}`} />
              {AVAILABILITY_LABEL[provider.availabilityStatus]}
            </span>
            {provider.serviceAreaCities.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {provider.serviceAreaCities.join('، ')}
              </p>
            )}
          </div>
        </div>
      </Link>

      {isOwnProvider && (
        <Button asChild variant="outline" className="w-full rounded-full py-3 h-auto gap-2">
          <Link href={ROUTES.adCreate}>
            <PlusCircle className="h-4 w-4" />
            نشر إعلان
          </Link>
        </Button>
      )}
    </div>
  );
}
