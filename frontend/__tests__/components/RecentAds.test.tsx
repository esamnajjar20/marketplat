/** RecentAds — homepage organic ads rail backed by the unified home feed. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentAds } from '@/components/home/RecentAds';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { useDataSaver } from '@/lib/useDataSaver';
import { useForYouItems } from '@/hooks/queries/useForYouItems';
import type { AdListItem } from '@/types/ad.types';

vi.mock('@/hooks/queries/useHomeFeed', () => ({ useHomeFeed: vi.fn() }));
vi.mock('@/lib/useDataSaver', () => ({ useDataSaver: vi.fn(() => false) }));
vi.mock('@/hooks/queries/useForYouItems', () => ({
  useForYouItems: vi.fn(() => ({ data: [] })),
  forYouIdsOf: vi.fn(() => []),
}));
vi.mock('@/components/ads/AdCard', () => ({
  AdCard: ({ ad, density, priority }: { ad: AdListItem; density?: string; priority?: boolean }) => (
    <div data-testid={`ad-card-${ad.id}`} data-density={density ?? 'default'} data-priority={String(Boolean(priority))}>{ad.title}</div>
  ),
}));
vi.mock('@/components/home/HomeScrollRail', () => ({
  HomeScrollRail: ({ children }: { children: React.ReactNode }) => <div data-testid="home-scroll-rail">{children}</div>,
  HomeScrollRailItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/shared/skeletons/AdCardSkeleton', () => ({ AdCardSkeleton: () => <div data-testid="ad-skeleton" /> }));
vi.mock('@/components/shared/ApiError', () => ({ ApiError: ({ onRetry }: { onRetry: () => void }) => <button onClick={onRetry}>إعادة المحاولة</button> }));

const mockUseHomeFeed = vi.mocked(useHomeFeed);
const mockUseDataSaver = vi.mocked(useDataSaver);
function makeAd(id: string, title = id): AdListItem {
  return { id, title, isFeatured: false, images: [], status: 'ACTIVE' } as unknown as AdListItem;
}
function feed(overrides: Record<string, unknown> = {}) {
  return { data: { rails: { ads: { items: [] } } }, isPending: false, isError: false, error: null, refetch: vi.fn(), ...overrides };
}

describe('RecentAds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDataSaver.mockReturnValue(false);
    vi.mocked(useForYouItems).mockReturnValue({ data: [] } as never);
    mockUseHomeFeed.mockReturnValue(feed() as never);
  });

  it('renders skeleton rail while the unified home feed is pending', () => {
    mockUseHomeFeed.mockReturnValue(feed({ isPending: true, data: undefined }) as never);
    render(<RecentAds />);
    expect(screen.getAllByTestId('ad-skeleton')).toHaveLength(6);
    expect(screen.queryByTestId(/^ad-card-/)).not.toBeInTheDocument();
  });

  it('renders compact cards from the ads rail', () => {
    mockUseHomeFeed.mockReturnValue(feed({ data: { rails: { ads: { items: [makeAd('a1', 'أول'), makeAd('a2', 'ثاني')] } } } } as never) as never);
    render(<RecentAds />);
    expect(screen.getByTestId('ad-card-a1')).toHaveAttribute('data-density', 'compact');
    expect(screen.getByTestId('ad-card-a2')).toBeInTheDocument();
  });

  it('limits the rail to six cards when data saver is enabled', () => {
    mockUseDataSaver.mockReturnValue(true);
    const items = Array.from({ length: 8 }, (_, i) => makeAd(`a${i}`));
    mockUseHomeFeed.mockReturnValue(feed({ data: { rails: { ads: { items } } } }) as never);
    render(<RecentAds />);
    expect(screen.getAllByTestId(/^ad-card-/)).toHaveLength(6);
  });

  it('shows an inline retry action when the home feed errors', () => {
    const refetch = vi.fn();
    mockUseHomeFeed.mockReturnValue(feed({ isError: true, error: new Error('offline'), refetch }) as never);
    render(<RecentAds />);
    screen.getByRole('button', { name: 'إعادة المحاولة' }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
