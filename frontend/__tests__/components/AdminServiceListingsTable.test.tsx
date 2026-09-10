/**
 * __tests__/components/AdminServiceListingsTable.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminServiceListingsTable } from '@/components/admin/AdminServiceListingsTable';
import { useAdminServiceListings } from '@/hooks/queries/useAdmin';
import { useAdminSetServiceListingStatus } from '@/hooks/mutations/useAdminMutations';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminServiceListings: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdminMutations', () => ({
  useAdminSetServiceListingStatus: vi.fn(),
}));

vi.mock('@/components/admin/AdminFilterBar', () => ({
  AdminFilterBar: () => <div data-testid="filter-bar" />,
}));

vi.mock('@/components/shared/skeletons/TableSkeleton', () => ({
  TableSkeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function mockTable({
  rows = [{ id: 's1', title: 'سباكة', price: '50', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z' }],
  isLoading = false,
  isError = false,
}: {
  rows?: Array<Record<string, unknown>>;
  isLoading?: boolean;
  isError?: boolean;
} = {}) {
  vi.mocked(useAdminServiceListings).mockReturnValue({
    data: { data: rows, meta: { pagination: { totalPages: 1 } } },
    isLoading,
    isError,
    refetch: vi.fn(),
  } as never);

  vi.mocked(useAdminSetServiceListingStatus).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never);
}

describe('AdminServiceListingsTable', () => {
  beforeEach(() => mockTable());

  it('shows loading skeleton', () => {
    mockTable({ isLoading: true, rows: [] });
    render(<AdminServiceListingsTable />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockTable({ isError: true, rows: [] });
    render(<AdminServiceListingsTable />);
    expect(screen.getByText(/تعذّر تحميل الخدمات/)).toBeInTheDocument();
  });

  it('renders service rows', () => {
    render(<AdminServiceListingsTable />);
    expect(screen.getAllByText('سباكة').length).toBeGreaterThan(0);
  });
});
