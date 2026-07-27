/**
 * __tests__/components/AdDetailSection.test.tsx
 *
 * FIX INTEG-10: AdDetailSection is the only real caller of AdDetail's
 * isFavorited prop. Its one piece of real logic is wiring
 * useIsFavorited(id) through to that prop — this pins that down so it
 * can't silently regress back to the always-false default.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdDetailSection } from '@/components/ads/AdDetailSection';
import { useAd } from '@/hooks/queries/useAds';
import { useIsFavorited } from '@/hooks/queries/useFavorites';
import type { Ad } from '@/types/ad.types';

vi.mock('@/hooks/queries/useAds', () => ({
  useAd: vi.fn(),
}));

vi.mock('@/hooks/queries/useFavorites', () => ({
  useFavorites: vi.fn(),
  useIsFavorited: vi.fn(),
}));

vi.mock('@/components/ads/RelatedAds', () => ({
  RelatedAds: () => <div>RelatedAds</div>,
}));

vi.mock('@/components/ads/AdDetail', () => ({
  AdDetail: ({ isFavorited }: { isFavorited?: boolean }) => (
    <div>AdDetail isFavorited={String(isFavorited)}</div>
  ),
}));

const baseAd = { id: 'ad-1', title: 'إعلان تجريبي' } as Ad;

describe('AdDetailSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading spinner while the ad is loading', () => {
    vi.mocked(useAd).mockReturnValue({ data: undefined, isLoading: true } as never);
    vi.mocked(useIsFavorited).mockReturnValue(false);

    render(<AdDetailSection id="ad-1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(/AdDetail/)).not.toBeInTheDocument();
  });

  it('renders nothing once loaded if there is no ad', () => {
    vi.mocked(useAd).mockReturnValue({ data: undefined, isLoading: false } as never);
    vi.mocked(useIsFavorited).mockReturnValue(false);

    const { container } = render(<AdDetailSection id="ad-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('calls useIsFavorited with the ad id', () => {
    vi.mocked(useAd).mockReturnValue({ data: baseAd, isLoading: false } as never);
    vi.mocked(useIsFavorited).mockReturnValue(false);

    render(<AdDetailSection id="ad-1" />);

    expect(useIsFavorited).toHaveBeenCalledWith('ad-1');
  });

  it('passes isFavorited=true through to AdDetail when the ad is already favorited', () => {
    vi.mocked(useAd).mockReturnValue({ data: baseAd, isLoading: false } as never);
    vi.mocked(useIsFavorited).mockReturnValue(true);

    render(<AdDetailSection id="ad-1" />);

    expect(screen.getByText('AdDetail isFavorited=true')).toBeInTheDocument();
  });

  it('passes isFavorited=false through to AdDetail when it is not favorited', () => {
    vi.mocked(useAd).mockReturnValue({ data: baseAd, isLoading: false } as never);
    vi.mocked(useIsFavorited).mockReturnValue(false);

    render(<AdDetailSection id="ad-1" />);

    expect(screen.getByText('AdDetail isFavorited=false')).toBeInTheDocument();
  });
});
