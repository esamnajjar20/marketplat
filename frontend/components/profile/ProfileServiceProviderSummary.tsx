import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { getAvatarUrl } from '@/lib/cloudinary';
import { ROUTES } from '@/lib/constants';
import type { PublicProfileServiceProvider } from '@/types/user.types';
import type { ServiceAvailability } from '@/types/service.types';

interface Props {
  provider: PublicProfileServiceProvider;
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
 */
export function ProfileServiceProviderSummary({ provider }: Props) {
  const logo = getAvatarUrl(provider.logoUrl ?? '', 96);

  return (
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
  );
}
