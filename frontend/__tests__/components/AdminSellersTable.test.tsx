/**
 * __tests__/components/AdminSellersTable.test.tsx
 *
 * Previously uncovered (0%), ~206 lines. Epic 1.1 — the missing UI for
 * the already-implemented verify/suspend seller backend endpoints.
 * Mirrors AdminUsersTable's structure: search input, table, per-row
 * action buttons, pagination, and a ConfirmDialog gating only the
 * destructive direction (suspend), not the reversible one (unsuspend).
 *
 * Coverage targets:
 *  - Loading spinner / error-with-retry / empty state
 *  - Renders seller name, email, rating (or "لا يوجد تقييم"), verified
 *    badge, suspended badge
 *  - Verify toggle: single click either direction, no confirm dialog,
 *    calls setVerified.mutate with the flipped boolean
 *  - Suspend: un-suspend is a single click; suspend opens ConfirmDialog
 *    first and only calls setSuspended.mutate on confirm
 *  - Per-row pending-disable: only the row whose mutation is in flight
 *    is disabled
 *  - Search: pushes ?q= on Enter/blur, clears ?page=, empty string
 *    passed as undefined (not '') to avoid the backend's min(1) 400
 *  - Pagination only rendered when totalPages > 1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdminSellersTable } from '@/components/admin/AdminSellersTable';
import { useAdminSellers } from '@/hooks/queries/useAdmin';
import { useAdminSetSellerVerified, useAdminSetSellerSuspended } from '@/hooks/mutations/useAdminMutations';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminSellers: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdminMutations', () => ({
  useAdminSetSellerVerified: vi.fn(),
  useAdminSetSellerSuspended: vi.fn(),
  useAdminBulkSetSellerVerified: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useAdminBulkSetSellerSuspended: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush, replace: mockPush }),
  // AdminFilterBar (rendered by this table) reads usePathname() to
  // build its filter links — real value here is unused by the
  // assertions below, so a string is enough.
  usePathname: () => '/admin/sellers',
}));

const mockSetVerifiedMutate = vi.fn();
const mockSetSuspendedMutate = vi.fn();

function makeSeller(overrides: Partial<{
  id: string; displayName: string; user: { email: string };
  totalRatings: number; averageRating: string | number;
  verified: boolean; suspended: boolean; createdAt: string;
}> = {}) {
  return {
    id: 'seller-1',
    displayName: 'متجر تجريبي',
    user: { email: 'seller@example.com' },
    totalRatings: 0,
    averageRating: 0,
    verified: false,
    suspended: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockSellersData(items: ReturnType<typeof makeSeller>[], extra: Partial<{
  isLoading: boolean; isError: boolean; refetch: () => void; totalPages: number;
}> = {}) {
  (useAdminSellers as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items, meta: { totalPages: extra.totalPages ?? 1 } },
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    refetch: extra.refetch ?? vi.fn(),
  });
}

describe('AdminSellersTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    (useAdminSetSellerVerified as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockSetVerifiedMutate, isPending: false, variables: undefined,
    });
    (useAdminSetSellerSuspended as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockSetSuspendedMutate, isPending: false, variables: undefined,
    });
    mockSellersData([makeSeller()]);
  });

  describe('loading / error / empty', () => {
    it('shows a loading spinner while fetching', () => {
      mockSellersData([], { isLoading: true });
      render(<AdminSellersTable />);
      expect(document.querySelector('.animate-pulse')).toBeTruthy();
    });

    it('shows an error state with a retry option that calls refetch', async () => {
      const refetch = vi.fn();
      mockSellersData([], { isError: true, refetch });
      const user = setupUser();
      render(<AdminSellersTable />);

      expect(screen.getByText('حدث خطأ ما')).toBeInTheDocument();
      await user.click(screen.getByText('إعادة المحاولة'));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('does not render "لا يوجد بائعون" on an error (must not read as "no sellers exist")', () => {
      mockSellersData([], { isError: true });
      render(<AdminSellersTable />);
      expect(screen.queryByText('لا يوجد بائعون')).not.toBeInTheDocument();
    });

    it('shows the empty state when there are no sellers', () => {
      mockSellersData([]);
      render(<AdminSellersTable />);
      expect(screen.getByText('لا يوجد بائعون')).toBeInTheDocument();
    });
  });

  describe('rendering', () => {
    it('renders the seller name and email', () => {
      mockSellersData([makeSeller({ displayName: 'متجر الأمل', user: { email: 'amal@example.com' } })]);
      render(<AdminSellersTable />);
      expect(screen.getAllByText('متجر الأمل').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('amal@example.com').length).toBeGreaterThan(0);
    });

    it('shows "لا يوجد تقييم" when totalRatings is 0', () => {
      mockSellersData([makeSeller({ totalRatings: 0 })]);
      render(<AdminSellersTable />);
      expect(screen.getAllByText('لا يوجد تقييم').length).toBeGreaterThanOrEqual(1);
    });

    it('shows the average rating and count when totalRatings > 0', () => {
      mockSellersData([makeSeller({ totalRatings: 12, averageRating: 4.567 })]);
      render(<AdminSellersTable />);
      expect(screen.getAllByText('4.6').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('(12)').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "موثّق" badge for a verified seller and "غير موثّق" for an unverified one', () => {
      mockSellersData([makeSeller({ verified: true })]);
      const { rerender } = render(<AdminSellersTable />);
      expect(screen.getAllByText('موثّق').length).toBeGreaterThanOrEqual(1);

      mockSellersData([makeSeller({ verified: false })]);
      rerender(<AdminSellersTable />);
      expect(screen.getAllByText('غير موثّق').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "موقوف" badge for a suspended seller and "نشط" for an active one', () => {
      mockSellersData([makeSeller({ suspended: true })]);
      const { rerender } = render(<AdminSellersTable />);
      expect(screen.getAllByText('موقوف').length).toBeGreaterThanOrEqual(1);

      mockSellersData([makeSeller({ suspended: false })]);
      rerender(<AdminSellersTable />);
      expect(screen.getAllByText('نشط').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('verify toggle (single click, no confirm)', () => {
    it('verifies an unverified seller on click', async () => {
      mockSellersData([makeSeller({ id: 'seller-9', displayName: 'بائع تسعة', verified: false })]);
      const user = setupUser();
      render(<AdminSellersTable />);

      await user.click(screen.getByLabelText('توثيق بائع تسعة'));

      expect(mockSetVerifiedMutate).toHaveBeenCalledWith({ sellerProfileId: 'seller-9', verified: true });
      expect(screen.queryByText('إيقاف هذا البائع؟')).not.toBeInTheDocument();
    });

    it('unverifies a verified seller on click', async () => {
      mockSellersData([makeSeller({ id: 'seller-9', displayName: 'بائع تسعة', verified: true })]);
      const user = setupUser();
      render(<AdminSellersTable />);

      await user.click(screen.getByLabelText('إلغاء توثيق بائع تسعة'));

      expect(mockSetVerifiedMutate).toHaveBeenCalledWith({ sellerProfileId: 'seller-9', verified: false });
    });

    it('disables the verify button only for the seller currently being verified', () => {
      (useAdminSetSellerVerified as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockSetVerifiedMutate, isPending: true, variables: { sellerProfileId: 'seller-1', verified: true },
      });
      mockSellersData([
        makeSeller({ id: 'seller-1', displayName: 'بائع واحد' }),
        makeSeller({ id: 'seller-2', displayName: 'بائع اثنان' }),
      ]);
      render(<AdminSellersTable />);

      expect(screen.getByLabelText('توثيق بائع واحد')).toBeDisabled();
      expect(screen.getByLabelText('توثيق بائع اثنان')).not.toBeDisabled();
    });
  });

  describe('suspend action', () => {
    it('un-suspends with a single click (no confirm dialog)', async () => {
      mockSellersData([makeSeller({ id: 'seller-9', displayName: 'بائع تسعة', suspended: true })]);
      const user = setupUser();
      render(<AdminSellersTable />);

      await user.click(screen.getByLabelText('رفع الإيقاف عن بائع تسعة'));

      expect(mockSetSuspendedMutate).toHaveBeenCalledWith({ sellerProfileId: 'seller-9', suspended: false });
      expect(screen.queryByText('إيقاف هذا البائع؟')).not.toBeInTheDocument();
    });

    it('clicking suspend opens the confirm dialog without suspending yet', async () => {
      mockSellersData([makeSeller({ id: 'seller-9', displayName: 'بائع تسعة', suspended: false })]);
      const user = setupUser();
      render(<AdminSellersTable />);

      await user.click(screen.getByLabelText('إيقاف بائع تسعة'));

      expect(screen.getByText('إيقاف هذا البائع؟')).toBeInTheDocument();
      expect(mockSetSuspendedMutate).not.toHaveBeenCalled();
    });

    it('confirming the dialog calls setSuspended.mutate with suspended: true and reason', async () => {
      mockSellersData([makeSeller({ id: 'seller-9', displayName: 'بائع تسعة', suspended: false })]);
      const user = setupUser();
      render(<AdminSellersTable />);

      await user.click(screen.getByLabelText('إيقاف بائع تسعة'));
      const reason = screen.getByLabelText(/السبب/);
      await user.type(reason, 'مخالفة السياسات');
      await user.click(screen.getByRole('button', { name: 'إيقاف' }));

      expect(mockSetSuspendedMutate).toHaveBeenCalledWith(
        { sellerProfileId: 'seller-9', suspended: true, reason: 'مخالفة السياسات' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('does not suspend when confirm is clicked without a reason', async () => {
      mockSellersData([makeSeller({ id: 'seller-9', displayName: 'بائع تسعة', suspended: false })]);
      const user = setupUser();
      render(<AdminSellersTable />);

      await user.click(screen.getByLabelText('إيقاف بائع تسعة'));
      expect(screen.getByRole('button', { name: 'إيقاف' })).toBeDisabled();
      expect(mockSetSuspendedMutate).not.toHaveBeenCalled();
    });

    it('cancelling the dialog does not suspend', async () => {
      mockSellersData([makeSeller({ id: 'seller-9', displayName: 'بائع تسعة', suspended: false })]);
      const user = setupUser();
      render(<AdminSellersTable />);

      await user.click(screen.getByLabelText('إيقاف بائع تسعة'));
      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(mockSetSuspendedMutate).not.toHaveBeenCalled();
      expect(screen.queryByText('إيقاف هذا البائع؟')).not.toBeInTheDocument();
    });

    it('disables the suspend button only for the seller currently being toggled', () => {
      (useAdminSetSellerSuspended as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockSetSuspendedMutate, isPending: true, variables: { sellerProfileId: 'seller-1', suspended: false },
      });
      mockSellersData([
        makeSeller({ id: 'seller-1', displayName: 'بائع واحد', suspended: true }),
        makeSeller({ id: 'seller-2', displayName: 'بائع اثنان', suspended: true }),
      ]);
      render(<AdminSellersTable />);

      expect(screen.getByLabelText('رفع الإيقاف عن بائع واحد')).toBeDisabled();
      expect(screen.getByLabelText('رفع الإيقاف عن بائع اثنان')).not.toBeDisabled();
    });
  });

  describe('search', () => {
    it('pushes ?q= and clears ?page= when Enter is pressed', async () => {
      const user = setupUser();
      render(<AdminSellersTable />);

      await user.type(screen.getByPlaceholderText('بحث بالاسم أو البريد…'), 'أحمد{Enter}');

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('q=%D8%A3%D8%AD%D9%85%D8%AF'));
      expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('page='));
    });

    it('removes ?q= entirely when cleared (not sent as an empty string)', async () => {
      mockSearchParams = new URLSearchParams('q=old');
      const user = setupUser();
      render(<AdminSellersTable />);

      const input = screen.getByPlaceholderText('بحث بالاسم أو البريد…');
      await user.clear(input);
      await user.tab();

      expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('q='));
    });
  });

  describe('pagination', () => {
    it('does not render pagination when totalPages is 1', () => {
      mockSellersData([makeSeller()], { totalPages: 1 });
      render(<AdminSellersTable />);
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('renders pagination when totalPages > 1', () => {
      mockSellersData([makeSeller()], { totalPages: 3 });
      render(<AdminSellersTable />);
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });
});
