'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { MapPoint } from './SearchResultsMap';
import Link from 'next/link';

// FIX MAP-SELFHOST-MARKER-01: the previous L.icon() pointed at three
// unpkg.com PNGs. middleware.ts's CSP img-src does NOT include unpkg
// (see its own comment -- it was tightened to Cloudinary + placehold.co
// only), so every marker rendered as a blank/broken image on the map.
// Even if we added unpkg, the app targets weak Gaza networks -- making
// the map depend on a foreign CDN for its primary UI is the wrong
// direction. L.divIcon with an inline SVG costs zero requests and
// can't be CSP-blocked.
const defaultIcon = L.divIcon({
  className: '',
  html: '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41" aria-hidden="true"><path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.875 12.5 41 12.5 41C12.5 41 25 21.875 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="#2563eb"/><circle cx="12.5" cy="12.5" r="4.5" fill="white"/></svg>',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const userIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:9999px;background:#2563eb;border:2px solid white;box-shadow:0 0 0 2px #2563eb55"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function FitBounds({
  points,
  userLocation,
}: {
  points: MapPoint[];
  userLocation: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    const latLngs: L.LatLngExpression[] = points.map((p) => [p.lat, p.lng]);
    if (userLocation) latLngs.push([userLocation.lat, userLocation.lng]);
    if (latLngs.length === 0) return;
    if (latLngs.length === 1) {
      const firstLatLng = latLngs[0]; if (firstLatLng) map.setView(firstLatLng, 14);
      return;
    }
    map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 15 });
  }, [map, points, userLocation]);
  return null;
}

export default function SearchResultsMapInner({
  points,
  userLocation,
}: {
  points: MapPoint[];
  userLocation: { lat: number; lng: number } | null;
}) {
  const center = useMemo<[number, number]>(() => {
    if (userLocation) return [userLocation.lat, userLocation.lng];
    if (points[0]) return [points[0].lat, points[0].lng];
    return [31.5, 34.47]; // Gaza fallback
  }, [points, userLocation]);

  return (
    <MapContainer
      center={center}
      zoom={12}
      className="h-full w-full z-0"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} userLocation={userLocation} />
      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
          <Popup>موقعك</Popup>
        </Marker>
      )}
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={defaultIcon}>
          <Popup>
            <div className="text-sm space-y-1 min-w-[120px]">
              <p className="font-medium">{p.title}</p>
              {p.subtitle && (
                <p className="text-xs text-muted-foreground">{p.subtitle}</p>
              )}
              {p.href && (
                <Link href={p.href} className="text-xs text-primary hover:underline">
                  عرض التفاصيل
                </Link>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
