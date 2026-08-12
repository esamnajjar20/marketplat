/**
 * __tests__/components/search/UnifiedResultCard.test.tsx
 *
 * Covers components/search/UnifiedResultCard.tsx:
 *   - links to result.url and shows the per-type badge label.
 *   - price renders only when non-null; rating/views/city conditionally.
 *   - seller name + verified badge.
 *   - distanceKm formatting: null -> nothing, <1km -> meters, >=1km -> "x.x كم".
 *   - views hidden for store-type results (stores have no view count semantics here).
 *   - falls back to the placeholder image when result.image is null.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnifiedResultCard } from '@/components/search/UnifiedResultCard';
import { PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import type { SearchResult } from '@/types/search.types';

const base: SearchResult = {
  id: 'r1',
  type: 'ad',
  title: 'لابتوب ديل مستعمل',
  description: '',
  image: null,
  city: 'غزة',
  rating: 0,
  views: 12,
  price: '450',
  seller: { id: 's1', name: 'محل الإلكترونيات', verified: false },
  url: '/ads/r1',
  createdAt: '2024-01-01T00:00:00Z',
  distanceKm: null,
};

describe('UnifiedResultCard', () => {
  it('links to result.url', () => {
    render(<UnifiedResultCard result={base} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/ads/r1');
  });

  it('shows the title', () => {
    render(<UnifiedResultCard result={base} />);
    expect(screen.getByText('لابتوب ديل مستعمل')).toBeInTheDocument();
  });

  it.each([
    ['ad', 'إعلان'],
    ['product', 'منتج'],
    ['store', 'محل'],
    ['service', 'خدمة'],
  ] as const)('shows the "%s" badge label "%s"', (type, label) => {
    render(<UnifiedResultCard result={{ ...base, type }} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders the formatted price when price is not null', () => {
    render(<UnifiedResultCard result={{ ...base, price: '450' }} />);
    expect(screen.getByText(formatPrice('450'))).toBeInTheDocument();
  });

  it('does not render a price line when price is null', () => {
    render(<UnifiedResultCard result={{ ...base, price: null }} />);
    expect(screen.queryByText(formatPrice('450'))).not.toBeInTheDocument();
  });

  it('shows the seller name', () => {
    render(<UnifiedResultCard result={base} />);
    expect(screen.getByText('محل الإلكترونيات')).toBeInTheDocument();
  });

  it('shows a verified badge when the seller is verified', () => {
    render(<UnifiedResultCard result={{ ...base, seller: { ...base.seller, verified: true } }} />);
    expect(screen.getByLabelText('بائع موثّق')).toBeInTheDocument();
  });

  it('does not show a verified badge when the seller is not verified', () => {
    render(<UnifiedResultCard result={base} />);
    expect(screen.queryByLabelText('بائع موثّق')).not.toBeInTheDocument();
  });

  it('shows the city when present', () => {
    render(<UnifiedResultCard result={{ ...base, city: 'خان يونس' }} />);
    expect(screen.getByText('خان يونس')).toBeInTheDocument();
  });

  it('shows the rating when greater than 0', () => {
    render(<UnifiedResultCard result={{ ...base, rating: 4.5 }} />);
    expect(screen.getByText('4.5')).toBeInTheDocument();
  });

  it('does not show a rating when it is 0', () => {
    render(<UnifiedResultCard result={{ ...base, rating: 0 }} />);
    expect(screen.queryByText('0.0')).not.toBeInTheDocument();
  });

  it('shows the view count for non-store types', () => {
    render(<UnifiedResultCard result={{ ...base, type: 'ad', views: 99 }} />);
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('hides the view count for store-type results', () => {
    render(<UnifiedResultCard result={{ ...base, type: 'store', views: 99 }} />);
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('renders no distance label when distanceKm is null', () => {
    render(<UnifiedResultCard result={{ ...base, distanceKm: null }} />);
    expect(screen.queryByText(/كم$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/م$/)).not.toBeInTheDocument();
  });

  it('formats distances under 1km in meters', () => {
    render(<UnifiedResultCard result={{ ...base, distanceKm: 0.35 }} />);
    // Rendered as "· 350 م" inside one <span> with a leading "· " text
    // node, so an exact getByText('350 م') misses it — match on the
    // element's full text content instead.
    expect(screen.getByText((_, el) => el?.textContent === '· 350 م')).toBeInTheDocument();
  });

  it('formats distances of 1km or more in kilometers to one decimal', () => {
    render(<UnifiedResultCard result={{ ...base, distanceKm: 3.2 }} />);
    expect(screen.getByText((_, el) => el?.textContent === '· 3.2 كم')).toBeInTheDocument();
  });

  it('shows the distance label even when city is absent', () => {
    render(<UnifiedResultCard result={{ ...base, city: null, distanceKm: 2 }} />);
    // Without a city, the component renders the bare distance (no "· " prefix).
    expect(screen.getByText('2.0 كم')).toBeInTheDocument();
  });

  it('renders the relative created-at time', () => {
    render(<UnifiedResultCard result={base} />);
    expect(screen.getByText(formatRelativeTime(base.createdAt))).toBeInTheDocument();
  });

  it('falls back to the placeholder image when result.image is null', () => {
    render(<UnifiedResultCard result={{ ...base, image: null }} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', PLACEHOLDER_SVG);
  });
});
