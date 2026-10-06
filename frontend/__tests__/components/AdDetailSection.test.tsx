/**
 * __tests__/components/AdDetailSection.test.tsx
 *
 * AdDetailSection is the only real caller of AdDetail's
 * isFavorited prop. Its one piece of real logic is wiring
 * useIsFavorited(id) through to that prop — this pins that down so it
 * can't silently regress back to the always-false default.
 *
 * UX-FIX (frontend audit P2-03): useFavorites({ limit: 100 }) replaced
 * with useFavoriteCheck(id) — mock updated to match.
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
  useFavoriteCheck: vi.fn(),
  useIsFavorited: vi.fn(),
}));

vi.mock('@/components/ads/RelatedAds', () => ({
  RelatedAds: () => <div>RelatedAds</div>,
}));

// AdBreadcrumb pulls in useCategoryHref (react-query via useCategories)
// and has its own test coverage — not what this file is testing. Mock
// it out so we don't need a QueryClientProvider just to render this tree.
vi.mock('@/components/ads/AdBreadcrumb', () => ({
  AdBreadcrumb: () => <div>AdBreadcrumb</div>,
}));

vi.mock('@/components/ads/AdDetail', () => ({
  AdDetail: ({ isFavorited }: { isFavorited?: boolean }) => (
    <div>AdDetail isFavorited={String(isFavorited)}</div>
  ),
  // AdBreadcrumb imports this from the same module; keep the mock's
  // shape consistent with the real module even though AdBreadcrumb
  // itself is mocked away above (defensive against re-ordering).
  useCategoryHref: vi.fn(() => undefined),
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

  // a missing ad (no data, no explicit error) now renders
  // a "not found" EmptyState instead of a blank page — see the
  // component's own comment on the isError || !ad branch.
  it('shows a "not found" state once loaded if there is no ad', () => {
    vi.mocked(useAd).mockReturnValue({ data: undefined, isLoading: false, isError: false } as never);
    vi.mocked(useIsFavorited).mockReturnValue(false);

    render(<AdDetailSection id="ad-1" />);
    expect(screen.getByText('الإعلان غير موجود')).toBeInTheDocument();
    expect(screen.queryByText(/AdDetail/)).not.toBeInTheDocument();
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
