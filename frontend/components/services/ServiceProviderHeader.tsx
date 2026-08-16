import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Star, Phone, MapPin } from 'lucide-react';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatPhone } from '@/lib/formatters';
import type { ServiceProviderPublic, ServiceAvailability } from '@/types/service.types';

interface Props {
  provider: ServiceProviderPublic;
}

const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

// FIX P2-3: see ServiceListingCard.tsx — same semantic-token swap,
// same three-state map duplicated across all three availability cards.
const AVAILABILITY_DOT: Record<ServiceAvailability, string> = {
  AVAILABLE: 'bg-success',
  BUSY: 'bg-warning',
  UNAVAILABLE: 'bg-muted-foreground',
};

/**
 * REDESIGN: same mock StoreHeader.tsx was rebuilt against — centered
 * avatar with a verified badge on it, name, stats card, full-width call
 * button, centered bio. A provider has no cover photo or follow
 * relationship (that's a store concept), so those are omitted; the
 * stats card uses what a provider actually has (rating / service
 * areas / availability) instead of a store's (followers/products/
 * city). Same data as before — only the layout changed.
 */
export function ServiceProviderHeader({ provider }: Props) {
  const avatar = getAvatarUrl(provider.logoUrl ?? provider.sellerProfile.avatarUrl ?? '', 128);
  const rating = parseFloat(provider.sellerProfile.averageRating);

  return (
    <div className="flex flex-col w-full items-center text-center pt-6">
      <div className="relative w-24 h-24 rounded-full bg-background p-1 shadow-md">
        <div className="relative w-full h-full rounded-full overflow-hidden bg-muted">
          <SafeImage variant="avatar" src={avatar} alt={provider.businessName} fill className="object-cover" sizes="96px" />
        </div>
        {provider.sellerProfile.verified && <VerifiedBadge />}
      </div>

      <h1 className="mt-4 text-xl font-bold text-foreground">{provider.businessName}</h1>

      <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
        <span className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[provider.availabilityStatus]}`} />
        {AVAILABILITY_LABEL[provider.availabilityStatus]}
      </span>

      {provider.sellerProfile.totalRatings > 0 && (
        <span className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
          <Star className="h-4 w-4 fill-rating text-rating" />
          {rating.toFixed(1)} ({provider.sellerProfile.totalRatings} تقييم)
        </span>
      )}

      {/* Stats card */}
      <div className="mt-4 w-full max-w-sm bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex justify-around items-center">
          <div className="flex flex-col items-center">
            <MapPin className="h-5 w-5 text-primary mb-1" />
            <span className="text-xs text-muted-foreground">{provider.serviceAreaCities.join('، ')}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 w-full max-w-sm">
        <a
          href={`tel:${provider.contactPhone}`}
          className="w-full bg-primary text-primary-foreground rounded-full py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium shadow-md transition-transform active:scale-95"
        >
          <Phone className="h-4 w-4" /> {formatPhone(provider.contactPhone)}
        </a>
      </div>

      <p className="mt-6 text-sm text-muted-foreground text-center max-w-[280px]">
        {provider.description}
      </p>
    </div>
  );
}
