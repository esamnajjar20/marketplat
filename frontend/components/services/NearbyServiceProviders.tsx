'use client';

import { useState } from 'react';
import { LocateFixed, MapPinOff } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import { useNearbyServiceProviders } from '@/hooks/queries/useServiceProviders';
import type { NearbyServiceProvidersParams } from '@/types/service.types';

type LocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ready'; lat: number; lng: number }
  | { status: 'denied' }
  | { status: 'unsupported' };

const RADIUS_KM = 10;

/**
 * Epic 4.3 gap fix: useNearbyServiceProviders (useServiceProviders.ts) and
 * GET /service-providers/nearby were both fully built but had zero UI
 * callers — no map, no "near me" trigger anywhere in the app. This
 * component is that trigger: it asks the browser for the user's
 * position, then feeds lat/lng into the existing hook unchanged.
 */
export function NearbyServiceProviders() {
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });
  const [page, setPage] = useState(1);

  const params: NearbyServiceProvidersParams | null =
    location.status === 'ready'
      ? { lat: location.lat, lng: location.lng, radius: RADIUS_KM, page, limit: 12 }
      : null;

  const { data, isLoading, isError, refetch } = useNearbyServiceProviders(params);

  function handleLocate() {
    if (!('geolocation' in navigator)) {
      setLocation({ status: 'unsupported' });
      return;
    }
    setLocation({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPage(1);
        setLocation({ status: 'ready', lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setLocation({ status: 'denied' }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }

  if (location.status === 'idle' || location.status === 'denied' || location.status === 'unsupported') {
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <EmptyState
          icon={location.status === 'idle' ? <LocateFixed className="h-8 w-8" /> : <MapPinOff className="h-8 w-8" />}
          title={
            location.status === 'idle'
              ? 'مقدمو خدمة قريبون منك'
              : location.status === 'denied'
                ? 'تعذّر الوصول إلى موقعك'
                : 'المتصفح لا يدعم تحديد الموقع'
          }
          description={
            location.status === 'idle'
              ? `اعثر على مقدمي خدمة ضمن ${RADIUS_KM} كم من موقعك الحالي`
              : location.status === 'denied'
                ? 'يرجى السماح بالوصول إلى الموقع من إعدادات المتصفح والمحاولة مجدداً'
                : undefined
          }
          action={
            location.status !== 'unsupported' && (
              <Button onClick={handleLocate} className="gap-2">
                <LocateFixed className="h-4 w-4" />
                استخدام موقعي الحالي
              </Button>
            )
          }
        />
      </div>
    );
  }

  if (location.status === 'locating' || isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner label="جارٍ البحث عن مقدمي خدمة قريبين…" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-destructive">حدث خطأ أثناء البحث عن مقدمي خدمة قريبين</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<MapPinOff className="h-8 w-8" />}
        title="لا يوجد مقدمو خدمة قريبون"
        description={`لم نجد مقدمي خدمة ضمن ${RADIUS_KM} كم من موقعك`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((provider) => (
          <ServiceProviderCard key={provider.id} provider={provider} />
        ))}
      </div>

      {totalPages > 1 && (
        // Inline client-state pager, not the shared URL-based Pagination
        // component — location here lives in useState, not the URL, so
        // there's no query-string page to read/write between renders.
        <nav className="flex items-center justify-center gap-2 py-4" aria-label="ترقيم الصفحات">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            التالي
          </Button>
        </nav>
      )}
    </div>
  );
}
