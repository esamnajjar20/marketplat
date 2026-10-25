import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecommendedAds } from '@/components/home/RecommendedAds';
import { useRecommendations } from '@/hooks/queries/useRecommendations';
vi.mock('@/hooks/queries/useRecommendations', () => ({ useRecommendations: vi.fn() }));
vi.mock('@/components/ads/AdCard', () => ({ AdCard: ({ ad }: any) => <div data-testid={`ad-${ad.id}`}>{ad.title}</div> }));
vi.mock('@/components/shared/skeletons/AdCardSkeleton', () => ({ AdCardSkeleton: () => <div data-testid="skeleton" /> }));
beforeEach(() => vi.clearAllMocks());
describe('RecommendedAds', () => {
  it('null when empty', () => {
    vi.mocked(useRecommendations).mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() } as any);
    expect(render(<RecommendedAds />).container.firstChild).toBeNull();
  });
  it('skeletons while loading', () => {
    vi.mocked(useRecommendations).mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() } as any);
    render(<RecommendedAds />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });
  it('renders ads', () => {
    vi.mocked(useRecommendations).mockReturnValue({ data: [{ id: 'a1', title: 'x', images: [], status: 'ACTIVE' }], isLoading: false, isError: false, refetch: vi.fn() } as any);
    render(<RecommendedAds />);
    expect(screen.getByTestId('ad-a1')).toBeInTheDocument();
  });
  it('retry on error', () => {
    const refetch = vi.fn();
    vi.mocked(useRecommendations).mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch } as any);
    render(<RecommendedAds />);
    fireEvent.click(screen.getByRole('button'));
    expect(refetch).toHaveBeenCalled();
  });
});
