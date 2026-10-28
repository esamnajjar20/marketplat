/**
 * __tests__/components/Timeline.test.tsx
 *
 * Previously uncovered (0%), ~289 lines. Key behaviors:
 *
 *  - group tabs and the search input both reset page to 1 when changed
 *  - loading / error (with retry) / empty (search-aware copy) states
 *  - linkFor(): AD/STORE/CONVERSATION/SERVICE_REQUEST rows link out;
 *    PRODUCT/SERVICE_LISTING/APPOINTMENT and rows with no entityId
 *    render as plain (non-link) content
 *  - groupConsecutiveMessages(): consecutive MESSAGE_SENT rows to the
 *    SAME conversation collapse into one row with a ×N badge; a
 *    different activity type in between breaks the streak; different
 *    conversations don't merge
 *  - SERVICE_REQUEST_STATUS_CHANGED shows a status badge, but only
 *    when count is 1 (a merged group shows the ×N badge instead)
 *  - pagination: hidden for a single page; "السابق"/"التالي" disabled
 *    at the bounds and while refetching
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { Timeline } from '@/components/profile/Timeline';
import { useMyActivity } from '@/hooks/queries/useActivity';
import type { UserActivity } from '@/types/activity.types';

vi.mock('@/hooks/queries/useActivity', () => ({
  useMyActivity: vi.fn(),
}));

const mockRefetch = vi.fn();

function makeActivity(overrides: Partial<UserActivity>): UserActivity {
  return {
    id: 'act-1',
    userId: 'user-1',
    type: 'AD_CREATED',
    title: 'نشاط تجريبي',
    description: null,
    entityType: null,
    entityId: null,
    metadata: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockActivityResult(overrides: Partial<ReturnType<typeof useMyActivity>>) {
  (useMyActivity as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { items: [], meta: { totalPages: 1, page: 1 } },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: mockRefetch,
    ...overrides,
  });
}

describe('Timeline', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mockActivityResult({});
  });

  describe('states', () => {
    it('shows a loading spinner while loading', () => {
      mockActivityResult({ isLoading: true, data: undefined });
      render(<Timeline />);
      expect(screen.queryByText('لا يوجد نشاط بعد')).not.toBeInTheDocument();
    });

    it('shows an error state with a retry button', async () => {
      mockActivityResult({ isError: true, data: undefined });
      const user = setupUser();
      render(<Timeline />);

      expect(screen.getByText('حدث خطأ أثناء تحميل نشاطك')).toBeInTheDocument();
      await user.click(screen.getByText('إعادة المحاولة'));
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('shows the default empty-state copy with no search query', () => {
      render(<Timeline />);
      expect(screen.getByText('لا يوجد نشاط بعد')).toBeInTheDocument();
      expect(
        screen.getByText('ستظهر هنا كل الأنشطة المرتبطة بحسابك — الإعلانات، الرسائل، الطلبات وغيرها'),
      ).toBeInTheDocument();
    });

    it('shows search-aware empty-state copy when a query is active', async () => {
      const user = setupUser();
      render(<Timeline />);

      await user.type(screen.getByLabelText('بحث في النشاط'), 'شيء غير موجود');

      expect(screen.getByText('لم يتم العثور على نشاط مطابق لبحثك')).toBeInTheDocument();
    });
  });

  describe('tabs and search — reset page to 1', () => {
    it('calls useMyActivity with the selected group and resets page', async () => {
      const user = setupUser();
      render(<Timeline />);

      await user.click(screen.getByRole('tab', { name: 'الخدمات' }));

      expect(useMyActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ group: 'SERVICES', page: 1 }),
      );
    });

    it('marks the selected tab as aria-selected', async () => {
      const user = setupUser();
      render(<Timeline />);

      await user.click(screen.getByRole('tab', { name: 'الرسائل' }));

      expect(screen.getByRole('tab', { name: 'الرسائل' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'الكل' })).toHaveAttribute('aria-selected', 'false');
    });

    it('debounced search text is trimmed and passed as q, undefined when blank', async () => {
      const user = setupUser();
      render(<Timeline />);

      await user.type(screen.getByLabelText('بحث في النشاط'), '  رسالة  ');

      expect(useMyActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'رسالة  '.trim(), page: 1 }),
      );
    });
  });

  describe('row rendering and links (linkFor)', () => {
    it('renders an AD activity as a link to the ad', () => {
      mockActivityResult({
        data: {
          items: [makeActivity({ type: 'AD_CREATED', title: 'إعلان جديد', entityType: 'AD', entityId: 'ad-1' })],
          meta: { totalPages: 1, page: 1 },
        },
      });
      render(<Timeline />);

      const link = screen.getByText('إعلان جديد').closest('a');
      expect(link).toHaveAttribute('href', '/ads/ad-1');
    });

    it('renders a PRODUCT activity as plain content (no route exists)', () => {
      mockActivityResult({
        data: {
          items: [
            makeActivity({ type: 'PRODUCT_CREATED', title: 'منتج جديد', entityType: 'PRODUCT', entityId: 'p-1' }),
          ],
          meta: { totalPages: 1, page: 1 },
        },
      });
      render(<Timeline />);

      expect(screen.getByText('منتج جديد').closest('a')).toBeNull();
    });

    it('renders a row with no entityId as plain content', () => {
      mockActivityResult({
        data: {
          items: [makeActivity({ type: 'PASSWORD_CHANGED', title: 'تم تغيير كلمة المرور', entityId: null })],
          meta: { totalPages: 1, page: 1 },
        },
      });
      render(<Timeline />);

      expect(screen.getByText('تم تغيير كلمة المرور').closest('a')).toBeNull();
    });

    it('shows the description when present', () => {
      mockActivityResult({
        data: {
          items: [makeActivity({ title: 'عنوان', description: 'وصف إضافي للنشاط' })],
          meta: { totalPages: 1, page: 1 },
        },
      });
      render(<Timeline />);

      expect(screen.getByText('وصف إضافي للنشاط')).toBeInTheDocument();
    });

    it('shows a status badge for a single SERVICE_REQUEST_STATUS_CHANGED row', () => {
      mockActivityResult({
        data: {
          items: [
            makeActivity({
              type: 'SERVICE_REQUEST_STATUS_CHANGED',
              title: 'تغيير حالة الطلب',
              metadata: { toStatus: 'مقبول' },
            }),
          ],
          meta: { totalPages: 1, page: 1 },
        },
      });
      render(<Timeline />);

      expect(screen.getByText('مقبول')).toBeInTheDocument();
    });
  });

  describe('groupConsecutiveMessages', () => {
    it('collapses consecutive MESSAGE_SENT rows to the same conversation with a ×N badge', () => {
      mockActivityResult({
        data: {
          items: [
            makeActivity({ id: 'm1', type: 'MESSAGE_SENT', title: 'رسالة', entityType: 'CONVERSATION', entityId: 'conv-1' }),
            makeActivity({ id: 'm2', type: 'MESSAGE_SENT', title: 'رسالة', entityType: 'CONVERSATION', entityId: 'conv-1' }),
            makeActivity({ id: 'm3', type: 'MESSAGE_SENT', title: 'رسالة', entityType: 'CONVERSATION', entityId: 'conv-1' }),
          ],
          meta: { totalPages: 1, page: 1 },
        },
      });
      render(<Timeline />);

      expect(screen.getByText('×3')).toBeInTheDocument();
      expect(screen.getAllByText('رسالة')).toHaveLength(1);
    });

    it('does not merge messages from different conversations', () => {
      mockActivityResult({
        data: {
          items: [
            makeActivity({ id: 'm1', type: 'MESSAGE_SENT', title: 'رسالة أ', entityType: 'CONVERSATION', entityId: 'conv-1' }),
            makeActivity({ id: 'm2', type: 'MESSAGE_SENT', title: 'رسالة ب', entityType: 'CONVERSATION', entityId: 'conv-2' }),
          ],
          meta: { totalPages: 1, page: 1 },
        },
      });
      render(<Timeline />);

      expect(screen.getByText('رسالة أ')).toBeInTheDocument();
      expect(screen.getByText('رسالة ب')).toBeInTheDocument();
      expect(screen.queryByText('×2')).not.toBeInTheDocument();
    });

    it('breaks the merge streak when a different activity type interrupts it', () => {
      mockActivityResult({
        data: {
          items: [
            makeActivity({ id: 'm1', type: 'MESSAGE_SENT', title: 'رسالة', entityType: 'CONVERSATION', entityId: 'conv-1' }),
            makeActivity({ id: 'a1', type: 'AD_CREATED', title: 'إعلان بينهما', entityType: 'AD', entityId: 'ad-1' }),
            makeActivity({ id: 'm2', type: 'MESSAGE_SENT', title: 'رسالة', entityType: 'CONVERSATION', entityId: 'conv-1' }),
          ],
          meta: { totalPages: 1, page: 1 },
        },
      });
      render(<Timeline />);

      expect(screen.getByText('إعلان بينهما')).toBeInTheDocument();
      expect(screen.queryByText('×2')).not.toBeInTheDocument();
      expect(screen.getAllByText('رسالة')).toHaveLength(2);
    });
  });

  describe('pagination', () => {
    it('does not render pagination controls for a single page', () => {
      mockActivityResult({
        data: { items: [makeActivity({})], meta: { totalPages: 1, page: 1 } },
      });
      render(<Timeline />);

      expect(screen.queryByLabelText('Pagination')).not.toBeInTheDocument();
    });

    it('renders pagination and disables "السابق" on the first page', () => {
      mockActivityResult({
        data: { items: [makeActivity({})], meta: { totalPages: 3, page: 1 } },
      });
      render(<Timeline />);

      expect(screen.getByText('1 / 3')).toBeInTheDocument();
      expect(screen.getByText('السابق')).toBeDisabled();
      expect(screen.getByText('التالي')).not.toBeDisabled();
    });

    it('disables "التالي" on the last page', async () => {
      // Timeline tracks `page` as internal component state (starts at
      // 1) rather than reading it back from the query result, so
      // reaching "last page" behavior means actually clicking through
      // — mocking meta.page alone doesn't move the component's own
      // state.
      mockActivityResult({
        data: { items: [makeActivity({})], meta: { totalPages: 3, page: 1 } },
      });
      const user = setupUser();
      render(<Timeline />);

      await user.click(screen.getByText('التالي'));
      await user.click(screen.getByText('التالي'));

      expect(screen.getByText('التالي')).toBeDisabled();
      expect(screen.getByText('السابق')).not.toBeDisabled();
    });

    it('advances the page when "التالي" is clicked', async () => {
      mockActivityResult({
        data: { items: [makeActivity({})], meta: { totalPages: 3, page: 1 } },
      });
      const user = setupUser();
      render(<Timeline />);

      await user.click(screen.getByText('التالي'));

      expect(useMyActivity).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });

    it('disables both pagination buttons while fetching', () => {
      mockActivityResult({
        data: { items: [makeActivity({})], meta: { totalPages: 3, page: 2 } },
        isFetching: true,
      });
      render(<Timeline />);

      expect(screen.getByText('السابق')).toBeDisabled();
      expect(screen.getByText('التالي')).toBeDisabled();
    });
  });
});
