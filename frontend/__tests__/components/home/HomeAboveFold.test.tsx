import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeAboveFold } from '@/components/home/HomeAboveFold';
import { useCategories } from '@/hooks/queries/useCategories';
import { useAds } from '@/hooks/queries/useAds';
import { useAdsForHome } from '@/hooks/queries/useAdsForHome';
import { useLocationResolver } from '@/hooks/useLocationResolver';
vi.mock('@/hooks/queries/useCategories', () => ({ useCategories: vi.fn() }));
vi.mock('@/hooks/queries/useAds', () => ({ useAds: vi.fn() }));
vi.mock('@/hooks/queries/useAdsForHome', () => ({ useAdsForHome: vi.fn() }));
vi.mock('@/hooks/useLocationResolver', () => ({ useLocationResolver: vi.fn() }));
vi.mock('@/components/home/CategoryGrid', () => ({ CategoryGrid: () => <div data-testid="category-grid" /> }));
vi.mock('@/components/home/FeaturedAds', () => ({ FeaturedAds: () => <div data-testid="featured-ads" /> }));
vi.mock('@/components/home/RecentAds', () => ({ RecentAds: () => <div data-testid="recent-ads" /> }));
vi.mock('@/components/home/SectionHeader', () => ({ SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2> }));
vi.mock('@/components/home/LocationSourceBadge', () => ({ LocationSourceBadge: () => <span /> }));
vi.mock('@/components/shared/skeletons/AdCardSkeleton', () => ({ AdCardSkeleton: () => <div data-testid="ad-skeleton" /> }));
vi.mock('@/components/shared/ui/Skeleton', () => ({ Skeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/shared/ui/Button', () => ({ Button: ({ children }: any) => <button>{children}</button> }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useLocationResolver).mockReturnValue({ location: { source: 'city', city: 'غزة' }, requestGps: vi.fn() } as any);
});
describe('HomeAboveFold', () => {
  it('skeleton while loading', () => {
    vi.mocked(useCategories).mockReturnValue({ isLoading: true } as any);
    vi.mocked(useAds).mockReturnValue({ isLoading: true } as any);
    vi.mocked(useAdsForHome).mockReturnValue({ isChecking: true, isLoading: true, source: 'city' } as any);
    render(<HomeAboveFold />);
    expect(screen.queryByTestId('category-grid')).not.toBeInTheDocument();
  });
  it('renders sections when ready', () => {
    vi.mocked(useCategories).mockReturnValue({ isLoading: false } as any);
    vi.mocked(useAds).mockReturnValue({ isLoading: false } as any);
    vi.mocked(useAdsForHome).mockReturnValue({ isChecking: false, isLoading: false, source: 'city' } as any);
    render(<HomeAboveFold />);
    expect(screen.getByTestId('category-grid')).toBeInTheDocument();
    expect(screen.getByTestId('featured-ads')).toBeInTheDocument();
    expect(screen.getByTestId('recent-ads')).toBeInTheDocument();
  });
});
