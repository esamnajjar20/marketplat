/** Tests for the mixed recommendation shelf backed by the unified home feed. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForYouMixedSection } from '@/components/home/ForYouMixedSection';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { useForYouItems } from '@/hooks/queries/useForYouItems';

const mocks = vi.hoisted(() => ({ isAuth: false }));
vi.mock('@/hooks/queries/useHomeFeed', () => ({ useHomeFeed: vi.fn() }));
vi.mock('@/hooks/queries/useForYouItems', () => ({ useForYouItems: vi.fn() }));
vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: mocks.isAuth }),
  selectIsAuthenticated: (state: { isAuthenticated: boolean }) => state.isAuthenticated,
}));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/components/ads/AdCard', () => ({ AdCard: ({ ad }: { ad: { id: string } }) => <div data-testid="card">ad-{ad.id}</div> }));
vi.mock('@/components/stores/ProductCard', () => ({ ProductCard: ({ product }: { product: { id: string } }) => <div data-testid="card">product-{product.id}</div> }));
vi.mock('@/components/services/ServiceListingCard', () => ({ ServiceListingCard: ({ listing }: { listing: { id: string } }) => <div data-testid="card">service-{listing.id}</div> }));
vi.mock('@/components/home/SectionHeader', () => ({ SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2> }));
vi.mock('@/components/home/HomeScrollRail', () => ({ HomeScrollRail: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, HomeScrollRailItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/shared/skeletons/AdCardSkeleton', () => ({ AdCardSkeleton: () => <div data-testid="skeleton" /> }));

const mockFeed = vi.mocked(useHomeFeed);
const mockItems = vi.mocked(useForYouItems);
const ad = (id: string) => ({ kind: 'ad' as const, data: { id, title: `ad-${id}` } });
const product = (id: string) => ({ kind: 'product' as const, data: { id, title: `product-${id}` } });
const service = (id: string) => ({ kind: 'service' as const, data: { id, title: `service-${id}` } });
const feed = (overrides: Record<string, unknown> = {}) => ({ isPending: false, isError: false, refetch: vi.fn(), ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAuth = false;
  mockFeed.mockReturnValue(feed() as never);
  mockItems.mockReturnValue([] as never);
});

describe('ForYouMixedSection', () => {
  it('shows loading skeletons while the home feed is pending', () => {
    mockFeed.mockReturnValue(feed({ isPending: true }) as never);
    render(<ForYouMixedSection />);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(4);
    expect(screen.getByText('رائج الآن')).toBeInTheDocument();
  });

  it('shows an error and retries the feed when requested', () => {
    const refetch = vi.fn();
    mockFeed.mockReturnValue(feed({ isError: true, refetch }) as never);
    render(<ForYouMixedSection />);
    expect(screen.getByText('تعذّر تحميل الاقتراحات')).toBeInTheDocument();
    screen.getByRole('button', { name: 'إعادة المحاولة' }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when there are no mixed items', () => {
    const { container } = render(<ForYouMixedSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders ads, products, and services from the shared mixed list', () => {
    mocks.isAuth = true;
    mockItems.mockReturnValue([ad('a1'), product('p1'), service('s1')] as never);
    render(<ForYouMixedSection />);
    expect(screen.getByText('مخصص لك')).toBeInTheDocument();
    expect(screen.getByText('ad-a1')).toBeInTheDocument();
    expect(screen.getByText('product-p1')).toBeInTheDocument();
    expect(screen.getByText('service-s1')).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(3);
  });

  it('uses the guest heading and login prompt for unauthenticated visitors', () => {
    mockItems.mockReturnValue([ad('a1')] as never);
    render(<ForYouMixedSection />);
    expect(screen.getByText('رائج الآن')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /سجّل دخولك/ })).toBeInTheDocument();
  });

  it('does not render cards from an empty feed when the user is signed in', () => {
    mocks.isAuth = true;
    mockItems.mockReturnValue([] as never);
    const { container } = render(<ForYouMixedSection />);
    expect(container).toBeEmptyDOMElement();
  });
});
