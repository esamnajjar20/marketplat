'use client';

/**
 * خريطة نتائج البحث — Leaflet عبر dynamic import (بدون SSR).
 *
 * المتوقع من الأب:
 * - items: نقاط فيها id, title, lat, lng, href اختياري
 * - userLocation?: { lat, lng }
 *
 * تثبيت الاعتماد:
 *   npm i leaflet react-leaflet
 *   npm i -D @types/leaflet
 * وفي globals.css أو layout:
 *   import 'leaflet/dist/leaflet.css'
 */

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export interface MapPoint {
  id: string;
  title: string;
  lat: number;
  lng: number;
  href?: string;
  subtitle?: string;
}

interface Props {
  points: MapPoint[];
  userLocation?: { lat: number; lng: number } | null;
  className?: string;
  /** ارتفاع الحاوية */
  height?: string;
}

// react-leaflet must not render on the server
const MapInner = dynamic(() => import('./SearchResultsMapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[280px] items-center justify-center">
      <LoadingSpinner />
    </div>
  ),
});

export function SearchResultsMap({
  points,
  userLocation,
  className,
  height = 'min-h-[320px] h-[50vh]',
}: Props) {
  const valid = useMemo(
    () => points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [points]
  );

  if (valid.length === 0 && !userLocation) {
    return (
      <div
        className={`flex ${height} items-center justify-center rounded-xl border bg-muted/30 text-sm text-muted-foreground ${className ?? ''}`}
      >
        لا توجد نتائج بإحداثيات لعرضها على الخريطة
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border ${height} ${className ?? ''}`}>
      <MapInner points={valid} userLocation={userLocation ?? null} />
    </div>
  );
}
