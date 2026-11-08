/**
 * __tests__/components/SellerTodayTasks.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SellerTodayTasks } from '@/components/profile/SellerTodayTasks';
import { useIsSeller } from '@/hooks/queries/useSellers';
import { useDashboardOverview } from '@/hooks/queries/useActivity';
import { useIsProvider } from '@/hooks/queries/useServiceProviders';

vi.mock('@/hooks/queries/useSellers', () => ({
  useIsSeller: vi.fn(() => ({ isSeller: true, isLoaded: true })),
}));
vi.mock('@/hooks/queries/useActivity', () => ({ useDashboardOverview: vi.fn() }));
vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useIsProvider: vi.fn(() => ({ isProvider: false, isLoaded: true })),
}));

describe('SellerTodayTasks', () => {
  beforeEach(() => {
    vi.mocked(useIsSeller).mockReturnValue({ isSeller: true, isLoaded: true } as never);
    vi.mocked(useIsProvider).mockReturnValue({ isProvider: false, isLoaded: true } as never);
    vi.mocked(useDashboardOverview).mockReturnValue({
      data: { activity: null, attention: {
        isProvider: false,
        hasStore: true,
        pendingServiceRequests: 0,
        adsMissingImages: 2,
        productsOutOfStock: 1,
        productsMissingImages: 0,
      }, activityError: false, attentionError: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
  });

  it('returns null when not seller or provider', () => {
    vi.mocked(useIsSeller).mockReturnValue({ isSeller: false, isLoaded: true } as never);
    vi.mocked(useIsProvider).mockReturnValue({ isProvider: false, isLoaded: true } as never);
    const { container } = render(<SellerTodayTasks />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders attention tasks when counts > 0', () => {
    render(<SellerTodayTasks />);
    expect(screen.getByText('يحتاج انتباهك')).toBeInTheDocument();
    expect(screen.getByText('إعلانات بدون صور')).toBeInTheDocument();
    expect(screen.getByText('منتجات غير متوفرة')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows loading pulse while loading', () => {
    vi.mocked(useDashboardOverview).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    const { container } = render(<SellerTodayTasks />);
    expect(container.querySelector('.skeleton-shimmer')).toBeTruthy();
  });
});
