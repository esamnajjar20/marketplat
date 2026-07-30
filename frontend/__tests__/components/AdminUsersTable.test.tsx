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
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUsersTable } from '@/components/admin/AdminUsersTable';
import { useAdminUsers } from '@/hooks/queries/useAdmin';
import { useAdminToggleUserActive, useAdminChangeRole } from '@/hooks/mutations/useAdminMutations';
import type { AdminUser } from '@/types/admin.types';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminUsers: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdminMutations', () => ({
  useAdminToggleUserActive: vi.fn(),
  useAdminChangeRole: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
}));

const mockToggleMutate = vi.fn();
const mockChangeRoleMutate = vi.fn();

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

const adminUser: AdminUser = {
  ...regularUser,
  id: 'admin-1',
  name: 'سارة المشرفة',
  role: 'ADMIN',
};

function mockUsersData(items: AdminUser[]) {
  (useAdminUsers as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items, meta: { totalPages: 1 } },
    isLoading: false,
  });
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
    mockUsersData([regularUser]);
  });

  describe('rendering (TYPE-ERROR-01 regression coverage)', () => {
    it('renders the user name without crashing, with no avatar image', () => {
      render(<AdminUsersTable />);

      expect(screen.getByText('أحمد محمد')).toBeInTheDocument();
      // AdminUser has no avatarUrl field — there must be no <img> in
      // the name cell now that it was removed.
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('renders the email, role badge, and status badge', () => {
      render(<AdminUsersTable />);

      expect(screen.getByText('ahmad@example.com')).toBeInTheDocument();
      expect(screen.getByText('مستخدم')).toBeInTheDocument();
      expect(screen.getByText('نشط')).toBeInTheDocument();
    });

    it('shows "مشرف" and "موقوف" badges for an inactive admin', () => {
      mockUsersData([{ ...adminUser, isActive: false }]);
      render(<AdminUsersTable />);

      expect(screen.getByText('مشرف')).toBeInTheDocument();
      expect(screen.getByText('موقوف')).toBeInTheDocument();
    });

    it('shows an empty-state message when there are no users', () => {
      mockUsersData([]);
      render(<AdminUsersTable />);

      expect(screen.getByText('لا يوجد مستخدمون')).toBeInTheDocument();
    });
  });

  describe('active/inactive toggle — fires immediately, no confirmation (AUDIT-V3-05 documented behavior)', () => {
    it('calls useAdminToggleUserActive.mutate directly on click, with no dialog', async () => {
      const user = userEvent.setup();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'إيقاف أحمد محمد' }));

      expect(mockToggleMutate).toHaveBeenCalledWith({ userId: 'user-1', isActive: false });
      // No confirmation dialog text should ever appear for this action.
      expect(screen.queryByText(/متأكد/)).not.toBeInTheDocument();
    });

    it('is disabled for a user whose role is ADMIN', () => {
      mockUsersData([adminUser]);
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'إيقاف سارة المشرفة' })).toBeDisabled();
    });
  });

  describe('role change — requires explicit confirmation (AUDIT-V3-05)', () => {
    it('does not call mutate immediately on click — opens a confirmation dialog first', async () => {
      const user = userEvent.setup();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'ترقية أحمد محمد إلى مدير' }));

      expect(mockChangeRoleMutate).not.toHaveBeenCalled();
      expect(screen.getByText('ترقية إلى مدير؟')).toBeInTheDocument();
    });

    it('calls useAdminChangeRole.mutate with role: ADMIN only after confirming a promotion', async () => {
      const user = userEvent.setup();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'ترقية أحمد محمد إلى مدير' }));
      await user.click(screen.getByRole('button', { name: 'ترقية' }));

      // UX-FIX P1-3: ConfirmDialog now waits for the mutation to resolve
      // before closing, so the caller passes an onSuccess callback
      // alongside the payload.
      expect(mockChangeRoleMutate).toHaveBeenCalledWith(
        { userId: 'user-1', role: 'ADMIN' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('calls useAdminChangeRole.mutate with role: USER after confirming a demotion', async () => {
      mockUsersData([adminUser]);
      const user = userEvent.setup();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'تنزيل سارة المشرفة إلى مستخدم' }));
      await user.click(screen.getByRole('button', { name: 'تنزيل' }));

      expect(mockChangeRoleMutate).toHaveBeenCalledWith(
        { userId: 'admin-1', role: 'USER' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('does not call mutate when the confirmation is cancelled', async () => {
      const user = userEvent.setup();
      render(<AdminUsersTable />);

      await user.click(screen.getByRole('button', { name: 'ترقية أحمد محمد إلى مدير' }));
      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(mockChangeRoleMutate).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('pushes a URL with the query param on Enter', async () => {
      const user = userEvent.setup();
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

    it('disables the role-change button only for the user whose role is currently changing', () => {
      mockUsersData([regularUser, { ...regularUser, id: 'user-2', name: 'خالد سالم' }]);
      (useAdminChangeRole as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockChangeRoleMutate, isPending: true, variables: { userId: 'user-1', role: 'ADMIN' },
      });
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'ترقية أحمد محمد إلى مدير' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'ترقية خالد سالم إلى مدير' })).not.toBeDisabled();
    });

    it('leaves both buttons enabled when no mutation is pending', () => {
      render(<AdminUsersTable />);

      expect(screen.getByRole('button', { name: 'إيقاف أحمد محمد' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'ترقية أحمد محمد إلى مدير' })).not.toBeDisabled();
    });
  });
});
