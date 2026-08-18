/**
 * __tests__/components/LocationSourceBadge.test.tsx
 *
 * "مؤشر مصدر النتائج" — the small pill Home sections show next to
 * their heading. Coverage: gps → "قريب منك", city (with a city value)
 * → "نتائج في {city}", general → "نتائج مقترحة", and the edge case of
 * source='city' with no city value provided (must not render a
 * "نتائج في undefined" — falls back to the generic label instead).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';

describe('LocationSourceBadge', () => {
  it('shows "قريب منك" for source=gps', () => {
    render(<LocationSourceBadge source="gps" />);
    expect(screen.getByText('قريب منك')).toBeInTheDocument();
  });

  it('shows "نتائج في {city}" for source=city with a city value', () => {
    render(<LocationSourceBadge source="city" city="غزة" />);
    expect(screen.getByText('نتائج في غزة')).toBeInTheDocument();
  });

  it('shows the generic "نتائج مقترحة" for source=general', () => {
    render(<LocationSourceBadge source="general" />);
    expect(screen.getByText('نتائج مقترحة')).toBeInTheDocument();
  });

  it('falls back to the generic label when source=city but no city value is provided', () => {
    render(<LocationSourceBadge source="city" />);
    expect(screen.getByText('نتائج مقترحة')).toBeInTheDocument();
    expect(screen.queryByText(/نتائج في/)).not.toBeInTheDocument();
  });
});
