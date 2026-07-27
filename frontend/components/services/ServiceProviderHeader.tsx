import Image from 'next/image';
import { BadgeCheck, Star, Phone, MapPin } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
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

const AVAILABILITY_DOT: Record<ServiceAvailability, string> = {
  AVAILABLE: 'bg-emerald-500',
  BUSY: 'bg-amber-500',
  UNAVAILABLE: 'bg-muted-foreground',
};

export function ServiceProviderHeader({ provider }: Props) {
  const avatar = getAvatarUrl(provider.logoUrl ?? provider.sellerProfile.avatarUrl ?? '', 96);
  const rating = parseFloat(provider.sellerProfile.averageRating);

  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-lg border bg-card">
      <div className="relative w-20 h-20 rounded-full overflow-hidden bg-muted shrink-0">
        <Image src={avatar} alt={provider.businessName} fill className="object-cover" sizes="80px" />
      </div>

      <div className="flex-1 space-y-1.5 text-center sm:text-start">
        <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
          <h1 className="text-xl font-bold">{provider.businessName}</h1>
          {provider.sellerProfile.verified && (
            <Badge className="gap-1">
              <BadgeCheck className="h-3.5 w-3.5" /> موثّق
            </Badge>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[provider.availabilityStatus]}`} />
            {AVAILABILITY_LABEL[provider.availabilityStatus]}
          </span>
        </div>

        <div className="flex items-center justify-center sm:justify-start gap-3 text-sm text-muted-foreground flex-wrap">
          {provider.sellerProfile.totalRatings > 0 && (
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {rating.toFixed(1)} ({provider.sellerProfile.totalRatings} تقييم)
            </span>
          )}
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4" /> {provider.serviceAreaCities.join('، ')}
          </span>
          <span className="flex items-center gap-1">
            <Phone className="h-4 w-4" /> {formatPhone(provider.contactPhone)}
          </span>
        </div>

        <p className="text-sm mt-2 max-w-md">{provider.description}</p>
      </div>
    </div>
  );
}
