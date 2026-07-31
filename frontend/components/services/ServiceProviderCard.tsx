import Link from 'next/link';
import Image from 'next/image';
import { MapPin } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatPhone } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ServiceProviderDetails, ServiceAvailability } from '@/types/service.types';

interface Props {
  provider: ServiceProviderDetails;
  className?: string;
}

const AVAILABILITY_DOT: Record<ServiceAvailability, string> = {
  AVAILABLE: 'bg-emerald-500',
  BUSY: 'bg-amber-500',
  UNAVAILABLE: 'bg-muted-foreground',
};

const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

/**
 * Card for /service-providers/nearby results. Deliberately only reads
 * fields present on ServiceProviderDetails (businessName, logoUrl,
 * description, serviceAreaCities, contactPhone, availabilityStatus) —
 * unlike ServiceListingCard/ServiceProviderHeader, the nearby endpoint's
 * response has no nested sellerProfile, so there's no verified badge or
 * rating to show here.
 */
export function ServiceProviderCard({ provider, className }: Props) {
  const avatar = getAvatarUrl(provider.logoUrl ?? '', 96);

  return (
    <Link
      href={ROUTES.serviceProvider(provider.id)}
      className={cn(
        'group flex gap-3 rounded-xl border bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg',
        className
      )}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
        <Image src={avatar} alt={provider.businessName} fill className="object-cover" sizes="64px" />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium">{provider.businessName}</h3>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <span className={cn('h-1.5 w-1.5 rounded-full', AVAILABILITY_DOT[provider.availabilityStatus])} />
            {AVAILABILITY_LABEL[provider.availabilityStatus]}
          </span>
        </div>
        <p className="line-clamp-1 text-sm text-muted-foreground">{provider.description}</p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{provider.serviceAreaCities.join('، ')}</span>
        </div>
        <p className="text-xs text-muted-foreground">{formatPhone(provider.contactPhone)}</p>
      </div>
    </Link>
  );
}
