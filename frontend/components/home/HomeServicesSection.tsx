'use client';

import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { ApiError } from '@/components/shared/ApiError';
import { useServiceListings } from '@/hooks/queries/useServiceListings';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { useSequentialGeoSearch } from '@/hooks/queries/useSequentialGeoSearch';
import { homeSectionLimit } from '@/lib/listLimits';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { formatDistanceKm } from '@/lib/distance';

/**
 * خدمات الرئيسية — GPS بتوسيع متسلسل؛ وإلا أحدث الخدمات العامة.
 */
export function HomeServicesSection() {
  const limit = homeSectionLimit(8, 4);
  const location = useLocationResolver();
  const isGps = location.source === 'gps-current' || location.source === 'gps-saved';

  const geo = useSequentialGeoSearch({
    enabled: isGps,
    lat: location.latitude,
    lng: location.longitude,
    type: 'services',
    limit,
  });

  const generalQuery = useServiceListings({
    limit,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const isChecking = location.isLoading;
  const useGeo = isGps && geo.settled && !geo.isError && geo.items.length > 0;
  const isLoading =
    isChecking ||
    (isGps && (!geo.settled || geo.isLoading)) ||
    (!isGps && generalQuery.isLoading) ||
    (isGps && geo.settled && geo.items.length === 0 && generalQuery.isLoading);

  const isError =
    (!isGps && generalQuery.isError) ||
    (isGps && geo.settled && geo.items.length === 0 && generalQuery.isError);

  if (isLoading) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-6 sm:pt-10 section-enter">
        <SectionHeader
          eyebrow="خدمات"
          title="خدمات متاحة"
          icon={<Briefcase className="h-3.5 w-3.5" />}
          cta={{ href: ROUTES.services, label: 'عرض الكل ←' }}
        />
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-[min(100%,280px)] shrink-0 sm:w-auto">
              <StoreCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-6 sm:pt-10">
        <SectionHeader
          eyebrow="خدمات"
          title="خدمات متاحة"
          icon={<Briefcase className="h-3.5 w-3.5" />}
          cta={{ href: ROUTES.services, label: 'عرض الكل ←' }}
        />
        <ApiError
          error={generalQuery.error}
          onRetry={() => {
            if (isGps) geo.refetch();
            else generalQuery.refetch();
          }}
          variant="inline"
        />
      </section>
    );
  }

  const listingItems = generalQuery.data?.items ?? [];
  if (!useGeo && listingItems.length === 0) return null;

  return (
    <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-6 sm:pt-10 section-enter">
      <SectionHeader
        eyebrow="خدمات"
        title="خدمات متاحة"
        icon={<Briefcase className="h-3.5 w-3.5" />}
        cta={{ href: ROUTES.services, label: 'عرض الكل ←' }}
        badge={
          <LocationSourceBadge
            source={useGeo ? 'gps' : 'general'}
            radiusKm={useGeo ? geo.radiusKm : null}
          />
        }
      />
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 md:grid-cols-3 lg:grid-cols-4 stagger-fade-in">
        {useGeo
          ? geo.items.map((item) => (
              <Link
                prefetch={false}
                key={item.id}
                href={ROUTES.serviceDetail(item.id)}
                className={cn(
                  'block w-[min(100%,280px)] shrink-0 rounded-xl border bg-card p-3 transition-all duration-200',
                  'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg active:scale-[0.98] sm:w-auto',
                )}
              >
                <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                {item.city && (
                  <p className="mt-1 text-xs text-muted-foreground">{item.city}</p>
                )}
                {formatDistanceKm(item.distanceKm) && (
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceKm(item.distanceKm)}
                  </span>
                )}
              </Link>
            ))
          : listingItems.map((listing) => (
              <div key={listing.id} className="w-[min(100%,280px)] shrink-0 sm:w-auto">
                <ServiceListingCard listing={listing} />
              </div>
            ))}
      </div>
    </section>
  );
}
