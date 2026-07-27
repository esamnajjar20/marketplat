/**
 * __tests__/components/AdminHeader.test.tsx
 *
 * AdminHeader's real logic: displays the current user's name, and its
 * logout handler always clears local state and redirects to /login
 * (via `finally`) even if the server-side logout API call fails —
 * this resilience guarantee is the one thing worth pinning down with
 * a real test rather than just a render smoke test.
 *
 * FIX INTEG-09: the notifications bell previously had no onClick at
 * all. It now links to /admin/reports and shows the live openReports
 * count from useAdminStats as a badge — covered below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { useAuthStore } from '@/store/auth.store';
import { useAdminStats } from '@/hooks/queries/useAdmin';
import { authApi } from '@/api/auth.api';
import { ROUTES } from '@/lib/constants';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
  selectLogout: (s: { logout: () => void }) => s.logout,
}));

vi.mock('@/api/auth.api', () => ({
  authApi: { logout: vi.fn() },
}));

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminStats: vi.fn(),
}));

const mockUseAuthStore = vi.mocked(useAuthStore);
const mockLogoutAction = vi.fn();

describe('AdminHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockImplementation((selector) =>
      selector({ user: { name: 'مدير النظام' }, logout: mockLogoutAction } as never),
    );
    vi.mocked(useAdminStats).mockReturnValue({ data: { openReports: 0 } } as never);
  });

  it("shows the current user's name", () => {
    render(<AdminHeader />);
    expect(screen.getByText('مدير النظام')).toBeInTheDocument();
  });

  it('clears local session and redirects to /login when the API logout call succeeds', async () => {
    vi.mocked(authApi.logout).mockResolvedValue({} as never);
    render(<AdminHeader />);

    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    expect(mockLogoutAction).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(ROUTES.login);
  });

  it('still clears local session and redirects to /login even if the API logout call fails', async () => {
    vi.mocked(authApi.logout).mockRejectedValue(new Error('network error'));
    render(<AdminHeader />);

    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    expect(mockLogoutAction).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(ROUTES.login);
  });

  describe('notifications bell', () => {
    it('links to the admin reports page', () => {
      render(<AdminHeader />);
      const link = screen.getByRole('button', { name: /الإشعارات/ }).closest('a');
      expect(link).toHaveAttribute('href', ROUTES.admin.reports);
    });

    it('shows no badge when there are no open reports', () => {
      vi.mocked(useAdminStats).mockReturnValue({ data: { openReports: 0 } } as never);
      render(<AdminHeader />);
      expect(screen.getByRole('button', { name: 'الإشعارات — 0 بلاغ بانتظار المراجعة' })).toBeInTheDocument();
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('shows the open reports count as a badge', () => {
      vi.mocked(useAdminStats).mockReturnValue({ data: { openReports: 5 } } as never);
      render(<AdminHeader />);
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'الإشعارات — 5 بلاغ بانتظار المراجعة' })).toBeInTheDocument();
    });

    it('caps the displayed badge at 99+', () => {
      vi.mocked(useAdminStats).mockReturnValue({ data: { openReports: 143 } } as never);
      render(<AdminHeader />);
      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('treats a missing stats response as zero open reports', () => {
      vi.mocked(useAdminStats).mockReturnValue({ data: undefined } as never);
      render(<AdminHeader />);
      expect(screen.getByRole('button', { name: 'الإشعارات — 0 بلاغ بانتظار المراجعة' })).toBeInTheDocument();
    });
  });
});
