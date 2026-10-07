'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatPhone } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { formatDistanceKm } from '@/lib/distance';
import { useAuthStore } from '@/store/auth.store';
import type { ServiceProviderDetails, ServiceAvailability } from '@/types/service.types';

interface Props {
  provider: Omit<ServiceProviderDetails, 'latitude' | 'longitude'> & { distanceKm?: number };
  className?: string;
}

const AVAILABILITY_DOT: Record<ServiceAvailability, string> = {
  AVAILABLE: 'bg-success',
  BUSY: 'bg-warning',
  UNAVAILABLE: 'bg-muted-foreground',
};

const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

/**
 * Directory card for /service-providers — design system aligned.
 */
export function ServiceProviderCard({ provider, className }: Props) {
  const avatar = getAvatarUrl(provider.logoUrl ?? '', 96);
  const userCity = useAuthStore((s) => s.user?.city ?? null);

  const distanceLabel = formatDistanceKm(provider.distanceKm);
  const sharedCity =
    distanceLabel === null && userCity
      ? provider.serviceAreaCities.find((city) => city === userCity)
      : null;

  return (
    <Link
      href={ROUTES.serviceProvider(provider.id)}
      prefetch={false}
      className={cn(
        'group flex h-full gap-3 rounded-2xl border border-border/80 bg-card p-3 shadow-sm',
        'transition-all duration-200 active:scale-[0.98]',
        'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        className,
      )}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/50">
        <SafeImage
          variant="avatar"
          src={avatar}
          alt={provider.businessName}
          fill
          className="object-cover"
          sizes="64px"
        />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold sm:text-card-title">
            {provider.businessName}
          </h3>
          {distanceLabel !== null ? (
            <span className="shrink-0 text-2xs font-medium text-primary sm:text-xs">
              {distanceLabel}
            </span>
          ) : sharedCity ? (
            <span className="shrink-0 text-2xs font-medium text-primary sm:text-xs">
              {sharedCity}
            </span>
          ) : null}
          <Badge size="sm" variant="secondary" className="gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                AVAILABILITY_DOT[provider.availabilityStatus],
              )}
            />
            {AVAILABILITY_LABEL[provider.availabilityStatus]}
          </Badge>
        </div>
        {provider.description?.trim() ? (
          <p className="line-clamp-1 text-xs text-muted-foreground sm:text-sm">
            {provider.description}
          </p>
        ) : null}
        {provider.serviceAreaCities.length > 0 ? (
          <div className="flex items-center gap-1 text-2xs text-muted-foreground sm:text-xs">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{provider.serviceAreaCities.join('، ')}</span>
          </div>
        ) : null}
        <p className="text-2xs text-muted-foreground sm:text-xs">
          {formatPhone(provider.contactPhone)}
        </p>
      </div>
    </Link>
  );
}
