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
 * count from useAdminOpsQueue as a badge — covered below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { useAuthStore } from '@/store/auth.store';
import { useAdminOpsQueue, useAdminReports } from '@/hooks/queries/useAdmin';
import { useLogout } from '@/hooks/mutations/useAuthMutations';
import { ROUTES } from '@/lib/constants';

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

vi.mock('@/hooks/mutations/useAuthMutations', () => ({
  useLogout: vi.fn(),
}));

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminOpsQueue: vi.fn(),
  useAdminReports: vi.fn(),
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
    vi.mocked(useAdminOpsQueue).mockReturnValue({ data: { openReports: 0 } } as never);
    // FIX P2-12: the bell now also pulls a recent-reports preview via
    // useAdminReports — mocked here the same way useAdminOpsQueue already
    // is, defaulting to an empty page so existing tests below don't
    // need to know about the preview unless they're testing it.
    vi.mocked(useAdminReports).mockReturnValue({ data: { items: [] } } as never);
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

  // UX-FIX: previously the only way out of (admin) was logging out
  // entirely — this links back to the public site without ending the
  // admin's session.
  it('links back to the public site', () => {
    render(<AdminHeader />);
    expect(screen.getByRole('link', { name: /العودة للموقع/ })).toHaveAttribute('href', ROUTES.home);
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
    // FIX P2-12: the bell trigger is no longer itself wrapped in an <a>
    // — it's a DropdownMenuTrigger that opens a preview panel, and the
    // link to the full reports page now lives inside that panel
    // ("عرض كل البلاغات") plus on each individual report row. This
    // replaces the old "closest('a') has the reports href" assertion
    // with one that opens the dropdown and checks the panel's own link.
    it('opens a preview panel with a link to the admin reports page', async () => {
      render(<AdminHeader />);
      await userEvent.click(screen.getByRole('button', { name: /الإشعارات/ }));
      const viewAllLink = await screen.findByRole('link', { name: 'عرض كل البلاغات' });
      expect(viewAllLink).toHaveAttribute('href', ROUTES.admin.reports);
    });

    it('does not enable the reports preview query until the bell is opened', async () => {
      render(<AdminHeader />);
      expect(vi.mocked(useAdminReports).mock.calls[0]?.[1]).toEqual({ enabled: false });
      await userEvent.click(screen.getByRole('button', { name: /الإشعارات/ }));
      expect(vi.mocked(useAdminReports).mock.calls.at(-1)?.[1]).toEqual({ enabled: true });
    });

    it('shows an empty message in the panel when there are no pending reports', async () => {
      vi.mocked(useAdminReports).mockReturnValue({ data: { items: [] } } as never);
      render(<AdminHeader />);
      await userEvent.click(screen.getByRole('button', { name: /الإشعارات/ }));
      expect(await screen.findByText('لا توجد بلاغات بانتظار المراجعة')).toBeInTheDocument();
    });

    it('shows no badge when there are no open reports', () => {
      vi.mocked(useAdminOpsQueue).mockReturnValue({ data: { openReports: 0 } } as never);
      render(<AdminHeader />);
      expect(screen.getByRole('button', { name: 'الإشعارات — 0 بلاغ بانتظار المراجعة' })).toBeInTheDocument();
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('shows the open reports count as a badge', () => {
      vi.mocked(useAdminOpsQueue).mockReturnValue({ data: { openReports: 5 } } as never);
      render(<AdminHeader />);
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'الإشعارات — 5 بلاغ بانتظار المراجعة' })).toBeInTheDocument();
    });

    it('caps the displayed badge at 99+', () => {
      vi.mocked(useAdminOpsQueue).mockReturnValue({ data: { openReports: 143 } } as never);
      render(<AdminHeader />);
      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('treats a missing stats response as zero open reports', () => {
      vi.mocked(useAdminOpsQueue).mockReturnValue({ data: undefined } as never);
      render(<AdminHeader />);
      expect(screen.getByRole('button', { name: 'الإشعارات — 0 بلاغ بانتظار المراجعة' })).toBeInTheDocument();
    });
  });
});
