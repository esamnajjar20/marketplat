import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicSalesStats } from '@/components/stores/PublicSalesStats';

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));

const cachedStats = {
  storeId: 'store-1',
  storeName: 'متجر محفوظ',
  storeSlug: 'saved-store',
  totalSales: 18,
  averageRating: 4.8,
  reviewCount: 12,
  verifiedSeller: true,
  lastSaleAt: null,
};

describe('PublicSalesStats Local-First rendering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps cached public statistics visible when an offline refetch fails', () => {
    mocks.useQuery.mockReturnValue({ data: cachedStats, isLoading: false, isError: true, isFetching: false });

    render(<PublicSalesStats slug="saved-store" />);

    expect(screen.getByRole('heading', { name: 'متجر محفوظ' })).toBeInTheDocument();
    expect(screen.getByText('إجمالي المبيعات')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('نعرض آخر نسخة محفوظة');
    expect(screen.queryByText('تعذر تحميل إحصائيات المتجر.')).not.toBeInTheDocument();
  });

  it('shows a blocking error only when no cached data is available', () => {
    mocks.useQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, isFetching: false });

    render(<PublicSalesStats slug="missing-store" />);

    expect(screen.getByText('تعذر تحميل إحصائيات المتجر.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'متجر محفوظ' })).not.toBeInTheDocument();
  });
});
