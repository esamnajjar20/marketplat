'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LocateFixed, X } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { DEFAULT_NEARBY_RADIUS_KM, GEO_POSITION_OPTIONS, isUsableNearbyCoord } from '@/lib/geo';
import { FEATURES } from '@/lib/featureFlags';

const RADIUS_KM = DEFAULT_NEARBY_RADIUS_KM;

/**
 * TRACK-NEARBY-SEARCH: URL-driven equivalent of
 * NearbyServiceProviders.tsx's geolocation trigger, adapted to this
 * page's "URL is the source of truth" convention (SearchFilters.tsx /
 * SearchTabsWrapper.tsx already push a new URL on every filter change
 * rather than lifting state through props) instead of that component's
 * local useState — lat/lng/radius are just three more URL params
 * SearchResults.tsx reads alongside q/city/type/categoryId/sort/page.
 *
 * Sets sort=distance the moment a position is captured, since a nearby
 * search with no distance ordering would be a confusing "why is this
 * far-away result first" experience — the person can still change sort
 * afterward via SearchFilters, same as changing any other filter.
 */
export function SearchNearbyToggle() {
  const router = useRouter();
  const sp = useSearchParams();
  const [status, setStatus] = useState<'idle' | 'locating' | 'denied' | 'unsupported'>('idle');

  const isActive = sp.get('lat') !== null && sp.get('lng') !== null;

  function handleLocate() {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!isUsableNearbyCoord(lat, lng)) {
          setStatus('denied');
          return;
        }
        setStatus('idle');
        const params = new URLSearchParams(sp.toString());
        params.set('lat', String(lat));
        params.set('lng', String(lng));
        params.set('radius', String(RADIUS_KM));
        params.set('sort', 'distance');
        params.delete('page');
        // refinement within the same search view —
        // same reasoning as SearchFilters' SW-FILTERS-REPLACE-01.
        router.replace(`${ROUTES.search}?${params.toString()}`);
      },
      () => setStatus('denied'),
      GEO_POSITION_OPTIONS
    );
  }

  function handleClear() {
    const params = new URLSearchParams(sp.toString());
    params.delete('lat');
    params.delete('lng');
    params.delete('radius');
    // A sort=distance with no lat/lng left is invalid (searchQuerySchema
    // rejects it server-side) — fall back to the default rather than
    // leaving a dead sort value in the URL.
    if (params.get('sort') === 'distance') params.delete('sort');
    params.delete('page');
    router.replace(`${ROUTES.search}?${params.toString()}`);
  }

  // FEATURE-FLAG-GPS: hide the toggle entirely when GPS is disabled.
  // Placed AFTER both hooks above so the Rules of Hooks order is
  // identical whether the flag is on or off.
  if (!FEATURES.GPS_LOCATION) return null;

  if (isActive) {
    return (
      <Button variant="secondary" size="sm" onClick={handleClear} className="gap-1.5">
        <X className="h-3.5 w-3.5" />
        إلغاء البحث القريب
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleLocate}
        disabled={status === 'locating'}
        className="gap-1.5"
      >
        <LocateFixed className="h-3.5 w-3.5" />
        {status === 'locating' ? 'جارٍ تحديد موقعك…' : `البحث ضمن ${RADIUS_KM} كم مني`}
      </Button>
      {status === 'denied' && (
        <p className="text-xs text-destructive">تعذّر الوصول إلى موقعك. يرجى السماح بالوصول من إعدادات المتصفح.</p>
      )}
      {status === 'unsupported' && (
        <p className="text-xs text-muted-foreground">المتصفح لا يدعم تحديد الموقع.</p>
      )}
    </div>
  );
}
