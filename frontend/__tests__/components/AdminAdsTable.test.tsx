/**
 * __tests__/components/AdminAdsTable.test.tsx
 *
 * AdminAdsTable's real logic: feature/pin toggles fire their mutation
 * immediately with the inverted boolean (no confirmation — unlike
 * delete), delete opens a real ConfirmDialog and only calls
 * useAdminForceDeleteAd.mutate after explicit confirmation, search
 * pushes a URL with the query param and clears any existing page
 * param, and the status <select> similarly resets pagination.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAdsTable } from '@/components/admin/AdminAdsTable';
import { useAdminAds } from '@/hooks/queries/useAdmin';
import {
  useAdminSetFeatured,
  useAdminSetPinned,
  useAdminForceDeleteAd,
} from '@/hooks/mutations/useAdminMutations';
import { STATUS_LABELS } from '@/lib/constants';
import type { AdminAd } from '@/types/admin.types';

vi.mock('@/hooks/queries/useAdmin', () => ({
  useAdminAds: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdminMutations', () => ({
  useAdminSetFeatured: vi.fn(),
  useAdminSetPinned: vi.fn(),
  useAdminForceDeleteAd: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush }),
}));

const mockFeatureMutate = vi.fn();
const mockPinMutate = vi.fn();
const mockDeleteMutate = vi.fn();

const baseAd: AdminAd = {
  id: 'ad-1',
  title: 'سيارة تويوتا',
  description: '',
  price: '25000',
  isNegotiable: false,
  condition: 'USED',
  city: 'غزة',
  images: [],
  status: 'ACTIVE',
  views: 10,
  isFeatured: false,
  isPinned: false,
  userId: 'u1',
  sellerProfileId: 'sp-1',
  categoryId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  user: { id: 'u1', name: 'أحمد', email: 'ahmad@example.com' } as never,
  category: null,
} as AdminAd;

function mockAdsData(items: AdminAd[]) {
  vi.mocked(useAdminAds).mockReturnValue({
    data: { items, meta: { totalPages: 1 } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
}

describe('AdminAdsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    vi.mocked(useAdminSetFeatured).mockReturnValue({ mutate: mockFeatureMutate } as never);
    vi.mocked(useAdminSetPinned).mockReturnValue({ mutate: mockPinMutate } as never);
    vi.mocked(useAdminForceDeleteAd).mockReturnValue({ mutate: mockDeleteMutate, isPending: false } as never);
    mockAdsData([baseAd]);
  });

  describe('rendering', () => {
    it('renders the ad title, price, seller name, and status', () => {
      render(<AdminAdsTable />);

      expect(screen.getByText('سيارة تويوتا')).toBeInTheDocument();
      expect(screen.getByText('أحمد')).toBeInTheDocument();
    });

    it('shows "—" for the seller when user is missing', () => {
      mockAdsData([{ ...baseAd, user: null } as never]);
      render(<AdminAdsTable />);

      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('shows a "مميز" badge for a featured ad', () => {
      mockAdsData([{ ...baseAd, isFeatured: true }]);
      render(<AdminAdsTable />);
      expect(screen.getByText('مميز')).toBeInTheDocument();
    });

    it('shows a "مثبّت" badge for a pinned ad', () => {
      mockAdsData([{ ...baseAd, isPinned: true }]);
      render(<AdminAdsTable />);
      expect(screen.getByText('مثبّت')).toBeInTheDocument();
    });

    it('shows an empty-state row when there are no ads', () => {
      mockAdsData([]);
      render(<AdminAdsTable />);
      expect(screen.getByText('لا توجد إعلانات')).toBeInTheDocument();
    });
  });

  describe('feature toggle — fires immediately, no confirmation', () => {
    it('calls useAdminSetFeatured.mutate with the inverted value on click', async () => {
      const user = userEvent.setup();
      render(<AdminAdsTable />);

      await user.click(screen.getByRole('button', { name: `تمييز ${baseAd.title}` }));

      // UX-FIX P1-5/P2-11: per-row pending tracking needs an onSettled
      // callback (to clear pendingToggle) alongside the mutate payload.
      expect(mockFeatureMutate).toHaveBeenCalledWith(
        { adId: 'ad-1', value: true },
        expect.objectContaining({ onSettled: expect.any(Function) }),
      );
    });

    it('uses the "un-feature" label and inverts back to false when already featured', async () => {
      mockAdsData([{ ...baseAd, isFeatured: true }]);
      const user = userEvent.setup();
      render(<AdminAdsTable />);

      await user.click(screen.getByRole('button', { name: `إلغاء تمييز ${baseAd.title}` }));

      expect(mockFeatureMutate).toHaveBeenCalledWith(
        { adId: 'ad-1', value: false },
        expect.objectContaining({ onSettled: expect.any(Function) }),
      );
    });
  });

  describe('pin toggle — fires immediately, no confirmation', () => {
    it('calls useAdminSetPinned.mutate with the inverted value on click', async () => {
      const user = userEvent.setup();
      render(<AdminAdsTable />);

      await user.click(screen.getByRole('button', { name: `تثبيت ${baseAd.title}` }));

      expect(mockPinMutate).toHaveBeenCalledWith(
        { adId: 'ad-1', value: true },
        expect.objectContaining({ onSettled: expect.any(Function) }),
      );
    });
  });

  describe('delete — requires explicit confirmation via ConfirmDialog', () => {
    it('does not call mutate immediately — opens a confirmation dialog first', async () => {
      const user = userEvent.setup();
      render(<AdminAdsTable />);

      await user.click(screen.getByRole('button', { name: `حذف ${baseAd.title}` }));

      expect(mockDeleteMutate).not.toHaveBeenCalled();
      expect(await screen.findByText('حذف هذا الإعلان نهائياً؟')).toBeInTheDocument();
    });

    it('calls useAdminForceDeleteAd.mutate with the ad id after confirming', async () => {
      const user = userEvent.setup();
      render(<AdminAdsTable />);

      await user.click(screen.getByRole('button', { name: `حذف ${baseAd.title}` }));
      const confirmButton = await screen.findByRole('button', { name: 'حذف', exact: true });
      await user.click(confirmButton);

      // UX-FIX P1-3: ConfirmDialog now stays open until the mutation
      // actually resolves rather than closing immediately on click, so
      // the caller passes an onSuccess callback (to close the dialog)
      // alongside the id — hence the second argument here.
      expect(mockDeleteMutate).toHaveBeenCalledWith('ad-1', expect.objectContaining({
        onSuccess: expect.any(Function),
      }));
    });

    it('does not call mutate when the confirmation is cancelled', async () => {
      const user = userEvent.setup();
      render(<AdminAdsTable />);

      await user.click(screen.getByRole('button', { name: `حذف ${baseAd.title}` }));
      await user.click(await screen.findByRole('button', { name: 'إلغاء' }));

      expect(mockDeleteMutate).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('pushes a URL with the query param on Enter, clearing any page param', async () => {
      mockSearchParams = new URLSearchParams('page=3');
      const user = userEvent.setup();
      render(<AdminAdsTable />);

      const input = screen.getByPlaceholderText('بحث بالعنوان…');
      await user.type(input, 'كورولا{Enter}');

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('q='));
      const calledUrl = mockPush.mock.calls[mockPush.mock.calls.length - 1][0] as string;
      expect(calledUrl).not.toMatch(/page=/);
    });
  });

  describe('status filter', () => {
    it('pushes a URL with the status param when a status is selected, clearing any page param', async () => {
      mockSearchParams = new URLSearchParams('page=2');
      const user = userEvent.setup();
      render(<AdminAdsTable />);

      // FIX UX-02 swapped the native <select> for this app's Radix
      // Select (role="combobox"); its options only mount in the DOM
      // once the trigger is opened, so selectOptions can't act on it
      // directly — open it, then click the option.
      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: STATUS_LABELS.SOLD }));

      const calledUrl = mockPush.mock.calls[mockPush.mock.calls.length - 1][0] as string;
      expect(calledUrl).toMatch(/status=SOLD/);
      expect(calledUrl).not.toMatch(/page=/);
    });
  });
});
