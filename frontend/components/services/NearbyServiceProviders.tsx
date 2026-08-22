'use client';

import { LocateFixed, MapPinOff } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import {
  useServiceProvidersDirectory,
  SERVICE_PROVIDERS_DIRECTORY_RADIUS_KM as RADIUS_KM,
} from '@/hooks/useServiceProvidersDirectory';

/**
 * Epic 4.3 gap fix, then FIX BUG-04 / ARCH-FIX: this started as a
 * GPS-only "near me" trigger for the previously-orphaned
 * useNearbyServiceProviders / GET /service-providers/nearby. It's now
 * the full directory for the "مقدمو الخدمة" nav destination, matching
 * Home's own "مقدمو خدمات قريبون منك" section: gps → city → general
 * cascade via useServiceProvidersDirectory, so denying location or
 * lacking geolocation support no longer dead-ends the page — see that
 * hook's own doc for the full cascade rules. The same LocationSourceBadge
 * used on Home shows which source actually produced the results
 * currently on screen.
 */
export function NearbyServiceProviders() {
  const { isChecking, source, data, isLoading, isError, refetch, page, setPage, city, requestLocation } =
    useServiceProvidersDirectory();

  const showSkeleton = isChecking || isLoading;
  const showLocateCta = source !== 'gps';

  if (showSkeleton) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <StoreCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-destructive">حدث خطأ أثناء تحميل مقدمي الخدمة</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LocationSourceBadge source={source} city={city} />
        {showLocateCta && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={requestLocation}>
            <LocateFixed className="h-3.5 w-3.5" />
            استخدام موقعي
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<MapPinOff className="h-8 w-8" />}
          title="لا يوجد مقدمو خدمة حالياً"
          description={
            source === 'gps'
              ? `لم نجد مقدمي خدمة ضمن ${RADIUS_KM} كم من موقعك`
              : 'لم نجد مقدمي خدمة لعرضهم في الوقت الحالي'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map((provider) => (
              <ServiceProviderCard key={provider.id} provider={provider} />
            ))}
          </div>

          {totalPages > 1 && (
            // Inline client-state pager, not the shared URL-based
            // Pagination component — the active source (gps/city/
            // general) lives in resolver + useState here, not the URL.
            <nav className="flex items-center justify-center gap-2 py-4" aria-label="ترقيم الصفحات">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
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
                onClick={() => setPage?.((p) => Math.min(totalPages, p + 1))}
              >
                التالي
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
