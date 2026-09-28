import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { useAdsForHome } from '@/hooks/queries/useAdsForHome';
import { useBrowseCity } from '@/hooks/useBrowseCity';

vi.mock('@/hooks/queries/useAdsForHome', () => ({ useAdsForHome: vi.fn() }));
vi.mock('@/hooks/useBrowseCity', () => ({ useBrowseCity: vi.fn() }));
vi.mock('@/components/home/RecentAds', () => ({ RecentAds: () => <div data-testid="recent-ads" /> }));
vi.mock('@/components/home/SectionHeader', () => ({
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock('@/components/home/LocationSourceBadge', () => ({
  LocationSourceBadge: ({ source, city }: { source: string; city?: string }) => (
    <span data-testid="badge">{`${source}:${city ?? ''}`}</span>
  ),
}));
vi.mock('@/components/shared/skeletons/AdCardSkeleton', () => ({
  AdCardSkeleton: () => <div data-testid="ad-skeleton" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useBrowseCity).mockReturnValue({ city: 'غزة' } as never);
});

describe('HomeAboveFold', () => {
  it('shows skeleton cards (and no list) while loading', () => {
    vi.mocked(useAdsForHome).mockReturnValue({ isChecking: true, isLoading: true, source: 'city' } as never);
    render(<HomeAboveFold />);
    expect(screen.getAllByTestId('ad-skeleton')).toHaveLength(6);
    expect(screen.queryByTestId('recent-ads')).not.toBeInTheDocument();
    expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
  });

  it('renders the ads rail with the city badge when ready', () => {
    vi.mocked(useAdsForHome).mockReturnValue({ isChecking: false, isLoading: false, source: 'city' } as never);
    render(<HomeAboveFold />);
    expect(screen.getByText('أحدث الإعلانات')).toBeInTheDocument();
    expect(screen.getByTestId('recent-ads')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('city:غزة');
  });

  it('does not pass the city to the badge when results are the general fallback', () => {
    vi.mocked(useAdsForHome).mockReturnValue({ isChecking: false, isLoading: false, source: 'general' } as never);
    render(<HomeAboveFold />);
    expect(screen.getByTestId('badge')).toHaveTextContent('general:');
  });
});
