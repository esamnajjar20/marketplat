/**
 * __tests__/components/SearchResultsMapInner.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('leaflet', () => {
  const icon = vi.fn(() => ({}));
  const divIcon = vi.fn(() => ({}));
  return {
    default: { icon, divIcon },
    icon,
    divIcon,
  };
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  TileLayer: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="marker">{children}</div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
}));

import SearchResultsMapInner from '@/components/map/SearchResultsMapInner';

describe('SearchResultsMapInner', () => {
  it('renders map with markers for points', () => {
    render(
      <SearchResultsMapInner
        points={[
          { id: '1', lat: 31.5, lng: 34.4, title: 'إعلان غزة', href: '/ads/1' },
          { id: '2', lat: 31.52, lng: 34.45, title: 'متجر', href: '/stores/1' },
        ]}
        userLocation={null}
      />,
    );
    expect(screen.getByTestId('map')).toBeInTheDocument();
    expect(screen.getAllByTestId('marker').length).toBeGreaterThan(0);
  });
});
