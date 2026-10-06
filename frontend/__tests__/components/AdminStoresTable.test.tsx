/**
 * __tests__/components/AdminStoresTable.test.tsx
 *
 * Mirrors AdminSellersTable.test.tsx's structure for the analogous
 * store-approval table (see AdminStoresTable.tsx's file header —
 * audit report issue #1).
 *
 * Coverage targets:
 *  - Loading spinner / error-with-retry / empty state
 *  - Status tabs default to PENDING when ?status is absent/invalid
 *    (), and ALL is honored when explicitly set
 *  - Renders store name, seller display name, city, status badge
 *  - Approve (PENDING/BLOCKED → ACTIVE): single click, no confirm
 *  - Un-block (BLOCKED → PENDING): single click, no confirm
 *  - Block (ACTIVE/PENDING → BLOCKED): opens ConfirmDialog first,
 *    only mutates on confirm; cancel does not mutate
 *  - Per-row pending-disable
 *  - Search: pushes ?q=, clears ?page=
 *  - Pagination only rendered when totalPages > 1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdminStoresTable } from '@/components/admin/AdminStoresTable';
import { useAdminStores } from '@/hooks/queries/useAdmin';
import { useAdminUpdateStoreStatus } from '@/hooks/mutations/useAdminMutations';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminStores: vi.fn(),
  useAdminStoreTypes: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/mutations/useAdminMutations', () => ({
  useAdminUpdateStoreStatus: vi.fn(),
  useAdminUpdateStorePlan: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useAdminUpdateStoreType: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useAdminBulkUpdateStoreStatus: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush, replace: mockPush }),
}));

const mockUpdateStatusMutate = vi.fn();

function makeStore(overrides: Partial<{
  id: string; name: string; city: string; status: 'PENDING' | 'ACTIVE' | 'BLOCKED';
  sellerProfile: { displayName: string }; createdAt: string;
}> = {}) {
  return {
    id: 'store-1',
    name: 'متجر تجريبي',
    city: 'غزة',
    status: 'PENDING' as const,
    sellerProfile: { displayName: 'بائع تجريبي' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockStoresData(items: ReturnType<typeof makeStore>[], extra: Partial<{
  isLoading: boolean; isError: boolean; refetch: () => void; totalPages: number;
}> = {}) {
  (useAdminStores as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items, meta: { totalPages: extra.totalPages ?? 1 } },
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    refetch: extra.refetch ?? vi.fn(),
  });
}

describe('AdminStoresTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    (useAdminUpdateStoreStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockUpdateStatusMutate, isPending: false, variables: undefined,
    });
    mockStoresData([makeStore()]);
  });

  describe('loading / error / empty', () => {
    it('shows a loading spinner while fetching', () => {
      mockStoresData([], { isLoading: true });
      render(<AdminStoresTable />);
      expect(document.querySelector('.animate-pulse')).toBeTruthy();
    });

    it('shows an error state with a retry option that calls refetch', async () => {
      const refetch = vi.fn();
      mockStoresData([], { isError: true, refetch });
      const user = setupUser();
      render(<AdminStoresTable />);

      expect(screen.getByText('حدث خطأ ما')).toBeInTheDocument();
      await user.click(screen.getByText('إعادة المحاولة'));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('does not render "لا توجد متاجر" on an error', () => {
      mockStoresData([], { isError: true });
      render(<AdminStoresTable />);
      expect(screen.queryByText('لا توجد متاجر')).not.toBeInTheDocument();
    });

    it('shows the empty state when there are no stores', () => {
      mockStoresData([]);
      render(<AdminStoresTable />);
      expect(screen.getByText('لا توجد متاجر')).toBeInTheDocument();
    });
  });

  describe('status filter tabs', () => {
    it('defaults to the PENDING tab when ?status is absent', () => {
      render(<AdminStoresTable />);
      const pendingTab = screen.getByRole('button', { name: 'قيد المراجعة' });
      expect(pendingTab.className).toContain('bg-primary');
    });

    it('defaults to PENDING when ?status is an invalid/unrecognized value (FIX SEC-3.9)', () => {
      mockSearchParams = new URLSearchParams('status=NOT_A_REAL_STATUS');
      render(<AdminStoresTable />);
      const pendingTab = screen.getByRole('button', { name: 'قيد المراجعة' });
      expect(pendingTab.className).toContain('bg-primary');
    });

    it('honors ?status=ALL', () => {
      mockSearchParams = new URLSearchParams('status=ALL');
      render(<AdminStoresTable />);
      const allTab = screen.getByText('الكل');
      expect(allTab.className).toContain('bg-primary');
    });

    it('pushes the selected status and clears ?page when a tab is clicked', async () => {
      const user = setupUser();
      render(<AdminStoresTable />);
      await user.click(screen.getByText('نشطة'));

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('status=ACTIVE'));
      expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('page='));
    });
  });

  describe('rendering', () => {
    it('renders the store name, seller display name, city and status badge', () => {
      mockStoresData([makeStore({
        name: 'متجر الأمل', city: 'رفح',
        sellerProfile: { displayName: 'أحمد' }, status: 'ACTIVE',
      })]);
      render(<AdminStoresTable />);

      expect(screen.getAllByText('متجر الأمل').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('أحمد').length).toBeGreaterThan(0);
      expect(screen.getAllByText('رفح').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('نشط').length).toBeGreaterThanOrEqual(1);
    });

    it('shows the "قيد المراجعة" badge for a PENDING store', () => {
      mockStoresData([makeStore({ status: 'PENDING' })]);
      render(<AdminStoresTable />);
      expect(screen.getAllByText('قيد المراجعة').length).toBeGreaterThan(0);
    });

    it('shows the "محظور" badge for a BLOCKED store', () => {
      mockStoresData([makeStore({ status: 'BLOCKED' })]);
      render(<AdminStoresTable />);
      expect(screen.getAllByText('محظور').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('approve action (single click, no confirm)', () => {
    it('approves a PENDING store on click', async () => {
      mockStoresData([makeStore({ id: 'store-9', name: 'متجر تسعة', status: 'PENDING' })]);
      const user = setupUser();
      render(<AdminStoresTable />);

      await user.click(screen.getByLabelText('الموافقة على متجر متجر تسعة'));

      expect(mockUpdateStatusMutate).toHaveBeenCalledWith({ storeId: 'store-9', status: 'ACTIVE' });
      expect(screen.queryByText('حظر هذا المتجر؟')).not.toBeInTheDocument();
    });

    it('does not show an approve button for an already-ACTIVE store', () => {
      mockStoresData([makeStore({ id: 'store-9', name: 'متجر تسعة', status: 'ACTIVE' })]);
      render(<AdminStoresTable />);
      expect(screen.queryByLabelText('الموافقة على متجر متجر تسعة')).not.toBeInTheDocument();
    });
  });

  describe('un-block action (single click, no confirm)', () => {
    it('un-blocks a BLOCKED store on click, setting status back to PENDING', async () => {
      mockStoresData([makeStore({ id: 'store-9', name: 'متجر تسعة', status: 'BLOCKED' })]);
      const user = setupUser();
      render(<AdminStoresTable />);

      await user.click(screen.getByLabelText('رفع الحظر عن متجر متجر تسعة'));

      expect(mockUpdateStatusMutate).toHaveBeenCalledWith({ storeId: 'store-9', status: 'PENDING' });
    });
  });

  describe('block action (requires confirm)', () => {
    it('clicking block opens the confirm dialog without blocking yet', async () => {
      mockStoresData([makeStore({ id: 'store-9', name: 'متجر تسعة', status: 'ACTIVE' })]);
      const user = setupUser();
      render(<AdminStoresTable />);

      await user.click(screen.getByLabelText('حظر متجر متجر تسعة'));

      expect(screen.getByText('حظر هذا المتجر؟')).toBeInTheDocument();
      expect(mockUpdateStatusMutate).not.toHaveBeenCalled();
    });

    it('confirming the dialog calls mutate with status: BLOCKED and reason', async () => {
      mockStoresData([makeStore({ id: 'store-9', name: 'متجر تسعة', status: 'ACTIVE' })]);
      const user = setupUser();
      render(<AdminStoresTable />);

      await user.click(screen.getByLabelText('حظر متجر متجر تسعة'));
      const reason = screen.getByLabelText(/السبب/);
      await user.type(reason, 'محتوى مخالف');
      await user.click(screen.getByRole('button', { name: 'حظر' }));

      expect(mockUpdateStatusMutate).toHaveBeenCalledWith(
        { storeId: 'store-9', status: 'BLOCKED', reason: 'محتوى مخالف' },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('cancelling the dialog does not block the store', async () => {
      mockStoresData([makeStore({ id: 'store-9', name: 'متجر تسعة', status: 'ACTIVE' })]);
      const user = setupUser();
      render(<AdminStoresTable />);

      await user.click(screen.getByLabelText('حظر متجر متجر تسعة'));
      await user.click(screen.getByRole('button', { name: 'إلغاء' }));

      expect(mockUpdateStatusMutate).not.toHaveBeenCalled();
      expect(screen.queryByText('حظر هذا المتجر؟')).not.toBeInTheDocument();
    });
  });

  describe('per-row pending state', () => {
    it('disables action buttons only for the store currently being updated', () => {
      (useAdminUpdateStoreStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockUpdateStatusMutate, isPending: true, variables: { storeId: 'store-1', status: 'ACTIVE' },
      });
      mockStoresData([
        makeStore({ id: 'store-1', name: 'متجر واحد', status: 'PENDING' }),
        makeStore({ id: 'store-2', name: 'متجر اثنان', status: 'PENDING' }),
      ]);
      render(<AdminStoresTable />);

      expect(screen.getByLabelText('الموافقة على متجر متجر واحد')).toBeDisabled();
      expect(screen.getByLabelText('الموافقة على متجر متجر اثنان')).not.toBeDisabled();
    });
  });

  describe('search', () => {
    it('pushes ?q= and clears ?page= when Enter is pressed', async () => {
      const user = setupUser();
      render(<AdminStoresTable />);

      await user.type(screen.getByPlaceholderText('بحث باسم المتجر…'), 'أمل{Enter}');

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('q='));
      expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('page='));
    });

    it('removes ?q= entirely when cleared', async () => {
      mockSearchParams = new URLSearchParams('q=old');
      const user = setupUser();
      render(<AdminStoresTable />);

      const input = screen.getByPlaceholderText('بحث باسم المتجر…');
      await user.clear(input);
      await user.tab();

      expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining('q='));
    });
  });

  describe('pagination', () => {
    it('does not render pagination when totalPages is 1', () => {
      mockStoresData([makeStore()], { totalPages: 1 });
      render(<AdminStoresTable />);
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('renders pagination when totalPages > 1', () => {
      mockStoresData([makeStore()], { totalPages: 3 });
      render(<AdminStoresTable />);
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });
});
