/**
 * DashboardStats — ads stats + optional store + optional service provider sections.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardStats } from '@/components/profile/DashboardStats';
import { useMyAdStats } from '@/hooks/queries/useAds';
import { useMyConversations } from '@/hooks/queries/useConversations';
import { useMyStoreAnalytics } from '@/hooks/queries/useStores';
import { useMyServiceProviderAnalytics } from '@/hooks/queries/useServiceProviders';

vi.mock('@/hooks/queries/useAds', () => ({
  useMyAdStats: vi.fn(),
}));
vi.mock('@/hooks/queries/useConversations', () => ({
  useMyConversations: vi.fn(),
}));
vi.mock('@/hooks/queries/useStores', () => ({
  useMyStoreAnalytics: vi.fn(),
}));
vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useMyServiceProviderAnalytics: vi.fn(),
}));

const mockUseMyAdStats = vi.mocked(useMyAdStats);
const mockUseMyConversations = vi.mocked(useMyConversations);
const mockUseMyStoreAnalytics = vi.mocked(useMyStoreAnalytics);
const mockUseMyServiceProviderAnalytics = vi.mocked(useMyServiceProviderAnalytics);

beforeEach(() => {
  mockUseMyConversations.mockReturnValue({
    data: { items: [] },
    isLoading: false,
  } as never);
  mockUseMyStoreAnalytics.mockReturnValue({
    data: undefined,
    isSuccess: false,
  } as never);
  mockUseMyServiceProviderAnalytics.mockReturnValue({
    data: undefined,
    isSuccess: false,
  } as never);
});

describe('DashboardStats', () => {
  it('shows a loading spinner while stats are loading', () => {
    mockUseMyAdStats.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    const { container } = render(<DashboardStats />);

    expect(container.querySelector('.py-8')).toBeInTheDocument();
    expect(screen.queryByText('الإعلانات النشطة')).not.toBeInTheDocument();
  });

  it('shows an error state with retry when the stats query fails, instead of rendering zeros silently', () => {
    const refetch = vi.fn();
    mockUseMyAdStats.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never);
    render(<DashboardStats />);

    expect(screen.getByText('حدث خطأ أثناء تحميل الإحصائيات')).toBeInTheDocument();
    expect(screen.queryByText('الإعلانات النشطة')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders each stat card with its corresponding value from the API response', () => {
    mockUseMyAdStats.mockReturnValue({
      data: { activeAds: 4, soldAds: 2, totalViews: 137, favoritesCount: 9 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<DashboardStats />);

    expect(screen.getByText('الإعلانات النشطة').closest('a,div')).toHaveTextContent(
      (4).toLocaleString('ar'),
    );
    expect(screen.getByText('إعلانات تم بيعها').closest('a,div')).toHaveTextContent(
      (2).toLocaleString('ar'),
    );
    expect(screen.getByText('إجمالي المشاهدات').closest('a,div')).toHaveTextContent(
      (137).toLocaleString('ar'),
    );
    expect(screen.getByText('المفضلة').closest('a,div')).toHaveTextContent(
      (9).toLocaleString('ar'),
    );
  });

  it('renders service provider section when analytics succeed', () => {
    mockUseMyAdStats.mockReturnValue({
      data: { activeAds: 0, soldAds: 0, totalViews: 0, favoritesCount: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseMyServiceProviderAnalytics.mockReturnValue({
      data: {
        activeListings: 3,
        pendingRequests: 2,
        upcomingAppointments: 1,
        completedRequests: 5,
        totalViews: 10,
        fulfillmentRate: null,
        averageRating: null,
        reviewCount: 0,
        revenue: 0,
        topListings: [],
        period: 'all',
      },
      isSuccess: true,
    } as never);

    render(<DashboardStats />);

    expect(screen.getByText('الخدمات')).toBeInTheDocument();
    expect(screen.getByText('خدمات نشطة').closest('a,div')).toHaveTextContent(
      (3).toLocaleString('ar'),
    );
    expect(screen.getByText('طلبات معلّقة').closest('a,div')).toHaveTextContent(
      (2).toLocaleString('ar'),
    );
  });
});
