/**
 * __tests__/components/AdminPlatformTrends.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminPlatformTrends } from '@/components/admin/AdminPlatformTrends';
import { useAdminPlatformTrends } from '@/hooks/queries/useAdmin';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminPlatformTrends: vi.fn(),
}));

vi.mock('@/lib/formatters', () => ({
  formatNumber: (n: number) => String(n),
}));

describe('AdminPlatformTrends', () => {
  beforeEach(() => {
    vi.mocked(useAdminPlatformTrends).mockReturnValue({
      data: {
        points: [
          { date: '2026-01-01', users: 10, ads: 5, reports: 1 },
          { date: '2026-01-02', users: 12, ads: 7, reports: 0 },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
  });

  it('shows loading', () => {
    vi.mocked(useAdminPlatformTrends).mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
      refetch: vi.fn(),
    } as never);
    render(<AdminPlatformTrends />);
    expect(screen.getByLabelText(/جارٍ التحميل/)).toBeInTheDocument();
  });

  it('shows error state', () => {
    vi.mocked(useAdminPlatformTrends).mockReturnValue({
      isLoading: false,
      isError: true,
      data: null,
      refetch: vi.fn(),
    } as never);
    render(<AdminPlatformTrends />);
    expect(document.body.textContent).toMatch(/تعذّر|خطأ|إعادة/);
  });

  it('renders range controls', () => {
    render(<AdminPlatformTrends />);
    expect(screen.getByText('7 أيام')).toBeInTheDocument();
    expect(screen.getByText(/30/)).toBeInTheDocument();
  });
});
