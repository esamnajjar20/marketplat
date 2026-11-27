'use client';

import { useState } from 'react';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { LocateFixed, X } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
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
  const filters = useUnifiedFilters({ basePath: '/search', profile: 'globalSearch', mode: 'replace' });
  const [status, setStatus] = useState<'idle' | 'locating' | 'denied' | 'unsupported'>('idle');

  const isActive = filters.has('lat') && filters.has('lng');

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
        // Coordinates and distance ordering are one atomic nearby-filter update.
        filters.updateMany({
          lat,
          lng,
          radius: RADIUS_KM,
          sort: 'distance',
        }, { mode: 'replace' });
      },
      () => setStatus('denied'),
      GEO_POSITION_OPTIONS
    );
  }

  function handleClear() {
    // A sort=distance with no coordinates is invalid; clear it atomically.
    filters.updateMany({
      lat: null,
      lng: null,
      radius: null,
      ...(filters.get('sort') === 'distance' ? { sort: null } : {}),
    }, { mode: 'replace' });
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
