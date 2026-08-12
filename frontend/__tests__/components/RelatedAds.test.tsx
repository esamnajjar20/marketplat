/**
 * __tests__/components/RelatedAds.test.tsx
 *
 * Real logic under test: loading skeleton grid, rendering nothing at
 * all when there's no related data (not even the section/heading —
 * distinct from every other list component's "empty state" pattern),
 * and rendering one AdCard per related ad. AdCard is stubbed to
 * isolate RelatedAds' own logic from AdCard's own dependencies
 * (favorites, auth store, cloudinary), same convention as
 * ImageUpload-stubbing in AdForm.test.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelatedAds } from '@/components/ads/RelatedAds';
import { useRelatedAds } from '@/hooks/queries/useAds';

vi.mock('@/hooks/queries/useAds', () => ({
  useRelatedAds: vi.fn(),
}));

vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({ ad }: { ad: { id: string; title: string } }) => <div data-testid="ad-card">{ad.title}</div>,
}));

const mockUseRelatedAds = vi.mocked(useRelatedAds);

describe('RelatedAds', () => {
  it('shows a skeleton grid of 4 placeholders while loading', () => {
    mockUseRelatedAds.mockReturnValue({ data: undefined, isLoading: true } as never);
    const { container } = render(<RelatedAds adId="ad-1" />);

    expect(screen.getByText('إعلانات مشابهة')).toBeInTheDocument();
    // AdCardSkeleton isn't mocked, but the grid should have 4 children.
    expect(container.querySelector('.grid')?.children.length).toBe(4);
  });

  it('renders nothing (not even the heading) when there is no related data', () => {
    mockUseRelatedAds.mockReturnValue({ data: [], isLoading: false } as never);
    const { container } = render(<RelatedAds adId="ad-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when data is undefined', () => {
    mockUseRelatedAds.mockReturnValue({ data: undefined, isLoading: false } as never);
    const { container } = render(<RelatedAds adId="ad-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an AdCard for each related ad', () => {
    mockUseRelatedAds.mockReturnValue({
      data: [{ id: 'ad-2', title: 'إعلان أول' }, { id: 'ad-3', title: 'إعلان ثاني' }],
      isLoading: false,
    } as never);
    render(<RelatedAds adId="ad-1" />);

    expect(screen.getByText('إعلانات مشابهة')).toBeInTheDocument();
    expect(screen.getAllByTestId('ad-card')).toHaveLength(2);
    expect(screen.getByText('إعلان أول')).toBeInTheDocument();
    expect(screen.getByText('إعلان ثاني')).toBeInTheDocument();
  });
});
