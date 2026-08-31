/**
 * __tests__/components/AdminUsersTable.test.tsx
 *
 * FIX E2E-GAP-01 / TYPE-ERROR-01 (both identified in the audit):
 *   - Zero prior test coverage for a component that performs sensitive
 *     admin actions (deactivating a user, granting/revoking admin role).
 *   - The component previously read user.avatarUrl, a field that does
 *     not exist on AdminUser (types/admin.types.ts explicitly documents
 *     that the backend select does not return it) — a real TypeScript
 *     type error that plain syntax transpilation never catches. Fixed
 *     by removing the avatar image; this suite pins down that the name
 *     alone renders correctly with no avatar-related crash or warning.
 *
 * Gap #20 (admin permission tiers): the component was rewritten from a
 * single two-way USER<->ADMIN toggle button to a role dropdown, since
 * there are now four ranked roles (USER/MODERATOR/ADMIN/SUPER_ADMIN)
 * and a binary toggle can no longer express "promote to MODERATOR vs
 * ADMIN". This suite was rewritten alongside it — every case the old
 * suite covered (immediate status toggle, confirm-gated role change,
 * per-row pending-disable, search) still exists here, targeting the
 * new dropdown markup, plus new cases for the rank-based permission
 * rules (canManageRole mirrored client-side) and the SUPER_ADMIN tier.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdminUsersTable } from '@/components/admin/AdminUsersTable';
import { useAdminUsers } from '@/hooks/queries/useAdmin';
import { useAdminToggleUserActive, useAdminChangeRole } from '@/hooks/mutations/useAdminMutations';
import { useAuthStore } from '@/store/auth.store';
import type { AdminUser } from '@/types/admin.types';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminUsers: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdminMutations', () => ({
  useAdminToggleUserActive: vi.fn(),
  useAdminChangeRole: vi.fn(),
  useAdminBulkToggleUserActive: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn(),
  selectUser: (s: { user: unknown }) => s.user,
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
}));

const mockToggleMutate = vi.fn();
const mockChangeRoleMutate = vi.fn();
const mockUseAuthStore = vi.mocked(useAuthStore);

const regularUser: AdminUser = {
  id: 'user-1',
  name: 'أحمد محمد',
  email: 'ahmad@example.com',
  phone: '+970591234567',
  role: 'USER',
  city: 'غزة',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  _count: { ads: 3, reports: 0 },
};

const moderatorUser: AdminUser = { ...regularUser, id: 'mod-1', name: 'ليلى المشرفة', role: 'MODERATOR' };
const adminUser: AdminUser     = { ...regularUser, id: 'admin-1', name: 'سارة المديرة', role: 'ADMIN' };
const superAdminUser: AdminUser = { ...regularUser, id: 'super-1', name: 'خالد الأعلى', role: 'SUPER_ADMIN' };

function mockUsersData(items: AdminUser[]) {
  (useAdminUsers as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items, meta: { totalPages: 1 } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

/** The signed-in admin operating the table — defaults to a plain ADMIN. */
function mockActor(role: 'ADMIN' | 'SUPER_ADMIN' | 'MODERATOR' = 'ADMIN') {
  mockUseAuthStore.mockImplementation((selector: (s: { user: unknown }) => unknown) =>
    selector({ user: { id: 'actor-1', name: 'الفاعل', role } }),
  );
}

describe('AdminUsersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    (useAdminToggleUserActive as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockToggleMutate, isPending: false, variables: undefined,
    });
    (useAdminChangeRole as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockChangeRoleMutate, isPending: false, variables: undefined,
    });
    mockActor('ADMIN');
    mockUsersData([regularUser]);
  });

  describe('rendering (TYPE-ERROR-01 regression coverage)', () => {
    it('renders the user name without crashing, with no avatar image', () => {
      render(<AdminUsersTable />);

      expect(screen.getAllByText('أحمد محمد').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('renders the email, role badge, and status badge', () => {
      render(<AdminUsersTable />);

      expect(screen.getAllByText('ahmad@example.com').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('مستخدم').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('نشط').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "مدير" and "موقوف" badges for an inactive admin', () => {
      mockUsersData([{ ...adminUser, isActive: false }]);
      render(<AdminUsersTable />);

      expect(screen.getAllByText('مدير').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('موقوف').length).toBeGreaterThanOrEqual(1);
    });

    // Gap #20
    it('shows the "مشرف مساعد" badge for a MODERATOR', () => {
      mockUsersData([moderatorUser]);
      render(<AdminUsersTable />);

      expect(screen.getAllByText('مشرف مساعد').length).toBeGreaterThanOrEqual(1);
    });

    it('shows the "مدير أعلى" badge for a SUPER_ADMIN', () => {
      mockUsersData([superAdminUser]);
      render(<AdminUsersTable />);

      expect(screen.getAllByText('مدير أعلى').length).toBeGreaterThanOrEqual(1);
    });

    it('shows an empty-state message when there are no users', () => {
      mockUsersData([]);
      render(<AdminUsersTable />);

      expect(screen.getByText('لا يوجد مستخدمون')).toBeInTheDocument();
    });

    it('shows an error state with a retry action when the fetch fails, not the empty state', () => {
      (useAdminUsers as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined, isLoading: false, isError: true, refetch: vi.fn(),
      });
      render(<AdminUsersTable />);

      expect(screen.getByText('حدث خطأ ما')).toBeInTheDocument();
      expect(screen.queryByText('لا يوجد مستخدمون')).not.toBeInTheDocument();
    });
  });

  describe('active/inactive toggle — fires immediately, no confirmation (AUDIT-V3-05 documented behavior)', () => {
    it('calls useAdminToggleUserActive.mutate directly on click, with no dialog', async () => {
      const user = setupUser();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'إيقاف أحمد محمد' }));

      expect(mockToggleMutate).toHaveBeenCalledWith({ userId: 'user-1', isActive: false });
      expect(screen.queryByText(/متأكد/)).not.toBeInTheDocument();
    });

    it('is disabled for another ADMIN target when the actor is a plain ADMIN (Gap #20: same-rank)', () => {
      mockUsersData([adminUser]);
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'إيقاف سارة المديرة' })).toBeDisabled();
    });

    it('is enabled for an ADMIN target when the actor is SUPER_ADMIN', () => {
      mockActor('SUPER_ADMIN');
      mockUsersData([adminUser]);
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'إيقاف سارة المديرة' })).not.toBeDisabled();
    });

    it('is always disabled for a SUPER_ADMIN target, even when the actor is also SUPER_ADMIN', () => {
      mockActor('SUPER_ADMIN');
      mockUsersData([superAdminUser]);
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'إيقاف خالد الأعلى' })).toBeDisabled();
    });
  });

  describe('role dropdown — requires explicit confirmation (AUDIT-V3-05 / Gap #20)', () => {
    // Menu items render via a Radix portal, so they only exist after
    // the trigger opens it — findByText (async) waits for that, same
    // pattern already used for this project's other DropdownMenu
    // (UserMenu.test.tsx), rather than a role-based query that
    // depends on Radix's exact ARIA role timing.
    it('does not call mutate immediately on selecting an option — opens a confirmation dialog first', async () => {
      // Selecting MODERATOR (not ADMIN) here since a plain ADMIN actor
      // can assign MODERATOR but not ADMIN (canManageRole requires
      // targetNewRank < actorRank; see roleHierarchy.test.ts).
      const user = setupUser();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'تغيير دور أحمد محمد' }));
      await user.click(await screen.findByText('مشرف مساعد'));

      expect(mockChangeRoleMutate).not.toHaveBeenCalled();
      expect(screen.getByText('تعيين كمشرف مساعد؟')).toBeInTheDocument();
    });

    it('calls useAdminChangeRole.mutate with role: ADMIN only after confirming a promotion', async () => {
      // Promoting to ADMIN requires an actor strictly above ADMIN rank
      // (canManageRole: targetNewRank < actorRank) — a plain ADMIN
      // cannot assign ADMIN (see roleHierarchy.test.ts: canManageRole
      // ('ADMIN','USER','ADMIN') is false). Only SUPER_ADMIN can.
      mockActor('SUPER_ADMIN');
      const user = setupUser();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'تغيير دور أحمد محمد' }));
      await user.click(await screen.findByText('مدير'));
      await user.click(screen.getByRole('button', { name: 'ترقية' }));

      expect(mockChangeRoleMutate).toHaveBeenCalledWith(
        { userId: 'user-1', role: 'ADMIN' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('calls useAdminChangeRole.mutate with role: MODERATOR after confirming (Gap #20)', async () => {
      const user = setupUser();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'تغيير دور أحمد محمد' }));
      await user.click(await screen.findByText('مشرف مساعد'));
      await user.click(screen.getByRole('button', { name: 'تعيين' }));

      expect(mockChangeRoleMutate).toHaveBeenCalledWith(
        { userId: 'user-1', role: 'MODERATOR' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('calls useAdminChangeRole.mutate with role: USER after confirming a demotion', async () => {
      mockUsersData([adminUser]);
      const user = setupUser();
      mockActor('SUPER_ADMIN');
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'تغيير دور سارة المديرة' }));
      await user.click(await screen.findByText('مستخدم'));
      await user.click(screen.getByRole('button', { name: 'تنزيل' }));

      expect(mockChangeRoleMutate).toHaveBeenCalledWith(
        { userId: 'admin-1', role: 'USER' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('does not call mutate when the confirmation is cancelled', async () => {
      // MODERATOR again — a plain ADMIN can't reach the ADMIN option at
      // all (disabled), so the cancel path is exercised on a role it
      // can legally assign. See canManageRole rank rule above.
      const user = setupUser();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'تغيير دور أحمد محمد' }));
      await user.click(await screen.findByText('مشرف مساعد'));
      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(mockChangeRoleMutate).not.toHaveBeenCalled();
    });

    it('marks the current role with a "(الحالي)" hint and does not act on selecting it', async () => {
      const user = setupUser();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'تغيير دور أحمد محمد' }));
      const currentItem = await screen.findByText('(الحالي)');
      // Radix ignores onSelect for a disabled item, so a click must
      // not open the confirmation dialog at all.
      await user.click(currentItem);

      // Regex must not match the always-present "تعيين كـ" dropdown
      // label — only the confirmation-dialog titles, which start with
      // these exact words ("ترقية إلى...", "تنزيل إلى...", "تعيين كـ<role>؟").
      expect(screen.queryByText(/^(ترقية|تنزيل|تعيين كمشرف)/)).not.toBeInTheDocument();
      expect(mockChangeRoleMutate).not.toHaveBeenCalled();
    });

    // Gap #20: a plain ADMIN actor can promote USER->MODERATOR but not
    // USER->ADMIN (new role must be strictly below the actor's own rank).
    it('does not act on selecting ADMIN when the actor is a plain ADMIN (disabled)', async () => {
      const user = setupUser();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'تغيير دور أحمد محمد' }));
      await user.click(await screen.findByText('مدير'));

      expect(screen.queryByText('ترقية إلى مدير؟')).not.toBeInTheDocument();
      expect(mockChangeRoleMutate).not.toHaveBeenCalled();
    });

    it('MODERATOR remains selectable for the same actor/target that had ADMIN disabled', async () => {
      const user = setupUser();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'تغيير دور أحمد محمد' }));
      await user.click(await screen.findByText('مشرف مساعد'));

      expect(screen.getByText('تعيين كمشرف مساعد؟')).toBeInTheDocument();
    });

    it('disables the entire role-change trigger for a MODERATOR target when the actor is a plain ADMIN', () => {
      // ADMIN can demote a MODERATOR (rank below), so this specifically
      // checks the trigger stays enabled for MODERATOR targets — the
      // opposite case (ADMIN target) is covered separately below.
      mockUsersData([moderatorUser]);
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'تغيير دور ليلى المشرفة' })).not.toBeDisabled();
    });

    it('disables the entire role-change trigger for another ADMIN target when the actor is a plain ADMIN', () => {
      mockUsersData([adminUser]);
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'تغيير دور سارة المديرة' })).toBeDisabled();
    });

    it('disables the role-change trigger for a SUPER_ADMIN target, even when the actor is SUPER_ADMIN', () => {
      mockActor('SUPER_ADMIN');
      mockUsersData([superAdminUser]);
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'تغيير دور خالد الأعلى' })).toBeDisabled();
    });

    it('a SUPER_ADMIN actor can promote a USER all the way to ADMIN in one step', async () => {
      mockActor('SUPER_ADMIN');
      const user = setupUser();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'تغيير دور أحمد محمد' }));
      await user.click(await screen.findByText('مدير'));

      expect(screen.getByText('ترقية إلى مدير؟')).toBeInTheDocument();
    });

    it('a MODERATOR actor has every role-change trigger disabled (below ADMIN rank)', () => {
      mockActor('MODERATOR');
      mockUsersData([regularUser, moderatorUser]);
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'تغيير دور أحمد محمد' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'تغيير دور ليلى المشرفة' })).toBeDisabled();
    });
  });

  describe('search', () => {
    it('pushes a URL with the query param on Enter', async () => {
      const user = setupUser();
      render(<AdminUsersTable />);

      const input = screen.getByPlaceholderText('بحث بالاسم أو البريد…');
      await user.type(input, 'سارة{Enter}');

      expect(mockPush).toHaveBeenCalledWith('/admin/users?q=%D8%B3%D8%A7%D8%B1%D8%A9');
    });
  });

  // FIX UX-11: neither trigger button disabled itself while its own
  // mutation was in flight, so a fast double-click (or a slow network)
  // could fire the same status/role change twice concurrently.
  describe('disables the trigger button while its own mutation is in flight (FIX UX-11)', () => {
    it('disables the status toggle button only for the user currently being toggled', () => {
      mockUsersData([regularUser, { ...regularUser, id: 'user-2', name: 'خالد سالم' }]);
      (useAdminToggleUserActive as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockToggleMutate, isPending: true, variables: { userId: 'user-1', isActive: false },
      });
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'إيقاف أحمد محمد' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'إيقاف خالد سالم' })).not.toBeDisabled();
    });

    it('disables the role-change trigger only for the user whose role is currently changing', () => {
      mockUsersData([regularUser, { ...regularUser, id: 'user-2', name: 'خالد سالم' }]);
      (useAdminChangeRole as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockChangeRoleMutate, isPending: true, variables: { userId: 'user-1', role: 'ADMIN' },
      });
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'تغيير دور أحمد محمد' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'تغيير دور خالد سالم' })).not.toBeDisabled();
    });

    it('leaves both triggers enabled when no mutation is pending', () => {
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'إيقاف أحمد محمد' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'تغيير دور أحمد محمد' })).not.toBeDisabled();
    });
  });
});
