'use client';

import { MapPinOff } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import { ServiceProvidersFilters } from '@/components/services/ServiceProvidersFilters';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { FEATURES } from '@/lib/featureFlags';
import {
  useServiceProvidersDirectory,
  SERVICE_PROVIDERS_DIRECTORY_RADIUS_KM as RADIUS_KM,
} from '@/hooks/useServiceProvidersDirectory';

/**
 * Directory for /service-providers — gps → city → general cascade
 * plus city filter via browse-city.
 */
export function NearbyServiceProviders() {
  const { isChecking, source, data, isLoading, isError, refetch, page, setPage, city, requestLocation } =
    useServiceProvidersDirectory();

  const showSkeleton = isChecking || isLoading;
  const showLocateCta = FEATURES.GPS_LOCATION && source !== 'gps';

  if (showSkeleton) {
    return (
      <div className="space-y-4">
        <ServiceProvidersFilters
          onRequestLocation={requestLocation}
          showLocateCta={showLocateCta}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <StoreCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <ServiceProvidersFilters
          onRequestLocation={requestLocation}
          showLocateCta={showLocateCta}
        />
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-destructive">حدث خطأ أثناء تحميل مقدمي الخدمة</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <ServiceProvidersFilters
        onRequestLocation={requestLocation}
        showLocateCta={showLocateCta}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <LocationSourceBadge source={source} city={city} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<MapPinOff className="h-8 w-8" />}
          title="لا يوجد مقدمو خدمة حالياً"
          description={
            source === 'gps'
              ? `لم نجد مقدمي خدمة ضمن ${RADIUS_KM} كم من موقعك`
              : city
                ? `لا مقدمي خدمة في ${city} حالياً — جرّب مدينة أخرى`
                : 'لم نجد مقدمي خدمة لعرضهم في الوقت الحالي'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 stagger-fade-in">
            {items.map((provider) => (
              <ServiceProviderCard key={provider.id} provider={provider} />
            ))}
          </div>

          {totalPages > 1 ? (
            <nav className="flex items-center justify-center gap-2 py-4" aria-label="ترقيم الصفحات">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                aria-label="الصفحة السابقة"
                onClick={() => setPage?.((p) => Math.max(1, p - 1))}
              >
                السابق
              </Button>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                aria-label="الصفحة التالية"
                onClick={() => setPage?.((p) => Math.min(totalPages, p + 1))}
              >
                التالي
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
