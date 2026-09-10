/**
 * __tests__/components/AdminOpsQueue.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdminOpsQueue } from '@/components/admin/AdminOpsQueue';
import { useAdminOpsQueue } from '@/hooks/queries/useAdmin';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminOpsQueue: vi.fn(),
}));

describe('AdminOpsQueue', () => {
  beforeEach(() => {
    vi.mocked(useAdminOpsQueue).mockReturnValue({
      data: {
        total: 7,
        openReports: 2,
        pendingStores: 3,
        pendingSellers: 1,
        unreviewedFraud: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
  });

  it('shows loading spinner', () => {
    vi.mocked(useAdminOpsQueue).mockReturnValue({
      isLoading: true,
      data: undefined,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<AdminOpsQueue />);
    expect(screen.queryByText('طابور العمل')).not.toBeInTheDocument();
  });

  it('shows error with retry', async () => {
    const refetch = vi.fn();
    vi.mocked(useAdminOpsQueue).mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      refetch,
    } as never);
    const user = setupUser();
    render(<AdminOpsQueue />);
    expect(screen.getByText(/تعذّر تحميل طابور العمل/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /إعادة المحاولة/ }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders queue items with counts', () => {
    render(<AdminOpsQueue />);
    expect(screen.getByText('طابور العمل')).toBeInTheDocument();
    expect(screen.getByText('بلاغات مفتوحة')).toBeInTheDocument();
    expect(screen.getByText('متاجر معلّقة')).toBeInTheDocument();
    expect(screen.getByText('بائعون للتحقق')).toBeInTheDocument();
    expect(screen.getByText('إشارات احتيال')).toBeInTheDocument();
  });
});
