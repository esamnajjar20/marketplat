'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { MapPoint } from './SearchResultsMap';
import Link from 'next/link';

// Default marker icons break under webpack; use CDN icons.
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
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
      const firstLatLng = latLngs[0];
      if (firstLatLng) {
        map.setView(firstLatLng, 14);
      }
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
