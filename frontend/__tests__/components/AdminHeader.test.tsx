/**
 * __tests__/components/AdminHeader.test.tsx
 *
 * AdminHeader's real logic: displays the current user's name, and its
 * logout button wires the shared useLogout() mutation's pending state
 * into the button's disabled state.
 *
 * AUDIT-FIX (admin #1 — critical): AdminHeader used to hand-roll its
 * own handleLogout (authApi.logout() + useAuthStore's logout() +
 * router.push) instead of using the already-existing useLogout() hook
 * — which additionally clears auth cookies, the service worker API
 * cache, and the React Query cache (see useAuthMutations.ts's
 * useClearLocalSession). That left admin-role cookies and a full
 * React Query cache of admin data readable in the browser after
 * "logging out". Now uses useLogout() directly, the same hook and the
 * same mocking pattern as UserMenu.test.tsx.
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
import { useLogout } from '@/hooks/mutations/useAuthMutations';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

vi.mock('@/hooks/mutations/useAuthMutations', () => ({
  useLogout: vi.fn(),
}));

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminStats: vi.fn(),
}));

const mockUseAuthStore = vi.mocked(useAuthStore);
const mockUseLogout = vi.mocked(useLogout);
const mockLogoutMutate = vi.fn();

describe('AdminHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthStore.mockImplementation((selector) =>
      selector({ user: { name: 'مدير النظام' } } as never),
    );
    vi.mocked(useAdminStats).mockReturnValue({ data: { openReports: 0 } } as never);
    mockUseLogout.mockReturnValue({
      mutate: mockLogoutMutate,
      isPending: false,
    } as never);
  });

  it("shows the current user's name", () => {
    render(<AdminHeader />);
    expect(screen.getByText('مدير النظام')).toBeInTheDocument();
  });

  it('calls the shared logout mutation when the logout button is clicked', async () => {
    render(<AdminHeader />);

    await userEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));

    expect(mockLogoutMutate).toHaveBeenCalledTimes(1);
  });

  it('disables the logout button while the mutation is pending', () => {
    mockUseLogout.mockReturnValue({
      mutate: mockLogoutMutate,
      isPending: true,
    } as never);
    render(<AdminHeader />);

    expect(screen.getByRole('button', { name: 'تسجيل الخروج' })).toBeDisabled();
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
