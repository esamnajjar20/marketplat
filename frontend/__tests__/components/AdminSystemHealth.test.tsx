/**
 * __tests__/components/AdminSystemHealth.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdminSystemHealth } from '@/components/admin/AdminSystemHealth';
import { useAdminSystemHealth } from '@/hooks/queries/useAdmin';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminSystemHealth: vi.fn(),
}));

describe('AdminSystemHealth', () => {
  beforeEach(() => {
    vi.mocked(useAdminSystemHealth).mockReturnValue({
      data: {
        db: { ok: true, latencyMs: 12, error: null },
        redis: { ok: true, latencyMs: 3, error: null },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      dataUpdatedAt: Date.now(),
    } as never);
  });

  it('shows loading', () => {
    vi.mocked(useAdminSystemHealth).mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
      refetch: vi.fn(),
    } as never);
    render(<AdminSystemHealth />);
    expect(screen.getByLabelText(/جارٍ التحميل/)).toBeInTheDocument();
  });

  it('shows error with retry', async () => {
    const refetch = vi.fn();
    vi.mocked(useAdminSystemHealth).mockReturnValue({
      isLoading: false,
      isError: true,
      data: null,
      refetch,
    } as never);
    const user = setupUser();
    render(<AdminSystemHealth />);
    expect(screen.getByText(/تعذّر فحص صحة النظام/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /إعادة المحاولة/ }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders db and redis status cards', () => {
    render(<AdminSystemHealth />);
    expect(screen.getByText('قاعدة البيانات')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
    expect(screen.getAllByText('سليم').length).toBeGreaterThan(0);
  });

  it('shows failure pill when redis down', () => {
    vi.mocked(useAdminSystemHealth).mockReturnValue({
      data: {
        db: { ok: true, latencyMs: 10, error: null },
        redis: { ok: false, latencyMs: null, error: 'timeout' },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      dataUpdatedAt: Date.now(),
    } as never);
    render(<AdminSystemHealth />);
    expect(screen.getByText('خلل')).toBeInTheDocument();
  });
});
