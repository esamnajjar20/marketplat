/**
 * __tests__/components/SellerTodayTasks.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SellerTodayTasks } from '@/components/profile/SellerTodayTasks';
import { useMyAttention, useIsSeller } from '@/hooks/queries/useSellers';
import { useIsProvider } from '@/hooks/queries/useServiceProviders';

vi.mock('@/hooks/queries/useSellers', () => ({
  useMyAttention: vi.fn(),
  useIsSeller: vi.fn(() => ({ isSeller: true, isLoaded: true })),
}));
vi.mock('@/hooks/queries/useServiceProviders', () => ({
  useIsProvider: vi.fn(() => ({ isProvider: false, isLoaded: true })),
}));

describe('SellerTodayTasks', () => {
  beforeEach(() => {
    vi.mocked(useIsSeller).mockReturnValue({ isSeller: true, isLoaded: true } as never);
    vi.mocked(useIsProvider).mockReturnValue({ isProvider: false, isLoaded: true } as never);
    vi.mocked(useMyAttention).mockReturnValue({
      data: {
        isProvider: false,
        hasStore: true,
        pendingServiceRequests: 0,
        adsMissingImages: 2,
        productsOutOfStock: 1,
        productsMissingImages: 0,
      },
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
    vi.mocked(useMyAttention).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    const { container } = render(<SellerTodayTasks />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });
});
