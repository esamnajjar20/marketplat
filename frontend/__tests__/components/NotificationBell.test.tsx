/**
 * __tests__/components/NotificationBell.test.tsx
 *
 * Previously uncovered (0%), ~268 lines. Real Radix DropdownMenu
 * (portal-rendered, closed until the trigger is clicked) — tests open
 * it via userEvent + findBy* rather than assuming content is present
 * on mount, same convention as UserMenu.test.tsx.
 *
 * Key behaviors:
 *  - unread badge: hidden at 0, shows the count, caps display at "99+"
 *  - loading / empty / populated list states
 *  - hrefFor(): NEW_MESSAGE links to the conversation, FAV_AD_* and
 *    SAVED_SEARCH_MATCH link to the ad, everything else (or missing
 *    data) renders as a button with no href and no mark-read-on-click
 *    navigation side effect
 *  - clicking an unread row marks it read; clicking an already-read
 *    row does not call the mutation again
 *  - clicking an unread NEW_MESSAGE row also marks every other unread
 *    NEW_MESSAGE row sharing the same conversationId — not rows from a
 *    different conversation, not already-read siblings, not other
 *    notification types
 *  - groupNotifications(): runs of 3+ consecutive same-type items
 *    collapse into one expandable group row; runs of 1-2 stay
 *    individual rows, even if the same type reappears non-consecutively
 *  - "mark all as read" only renders when there's an unread count, and
 *    is disabled while pending
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { useMyNotifications, useUnreadNotificationCount } from '@/hooks/queries/useNotifications';
import {
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks/mutations/useNotificationMutations';
import type { Notification } from '@/types/notification.types';

vi.mock('@/hooks/queries/useNotifications', () => ({
  useMyNotifications: vi.fn(),
  useUnreadNotificationCount: vi.fn(),
}));

vi.mock('@/hooks/mutations/useNotificationMutations', () => ({
  useMarkNotificationRead: vi.fn(),
  useMarkAllNotificationsRead: vi.fn(),
}));

const mockMarkReadMutate = vi.fn();
const mockMarkAllReadMutate = vi.fn();

function makeNotification(overrides: Partial<Notification>): Notification {
  return {
    id: 'notif-1',
    type: 'PROMOTION',
    title: 'عنوان الإشعار',
    body: 'نص الإشعار',
    data: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function openMenu(user: ReturnType<typeof setupUser>) {
  await user.click(screen.getByRole('button', { name: 'الإشعارات' }));
}

describe('NotificationBell', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    (useUnreadNotificationCount as ReturnType<typeof vi.fn>).mockReturnValue({ data: 0 });
    (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [] },
      isLoading: false,
    });
    (useMarkNotificationRead as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMarkReadMutate,
    });
    (useMarkAllNotificationsRead as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMarkAllReadMutate,
      isPending: false,
    });
  });

  describe('unread badge', () => {
    it('shows no badge when unread count is 0', () => {
      render(<NotificationBell />);
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('shows the unread count', () => {
      (useUnreadNotificationCount as ReturnType<typeof vi.fn>).mockReturnValue({ data: 5 });
      render(<NotificationBell />);
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('caps the displayed badge at "99+" beyond 99', () => {
      (useUnreadNotificationCount as ReturnType<typeof vi.fn>).mockReturnValue({ data: 150 });
      render(<NotificationBell />);
      expect(screen.getByText('99+')).toBeInTheDocument();
    });
  });

  describe('dropdown states', () => {
    it('shows a loading spinner while notifications are loading', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: undefined,
        isLoading: true,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      expect(await screen.findByText('الإشعارات')).toBeInTheDocument();
      expect(screen.queryByText('لا توجد إشعارات')).not.toBeInTheDocument();
    });

    it('shows an empty state when there are no notifications', async () => {
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      expect(await screen.findByText('لا توجد إشعارات')).toBeInTheDocument();
    });

    it('renders a notification row with title, body, and relative time', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { items: [makeNotification({ title: 'رسالة جديدة', body: 'محتوى الرسالة' })] },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      expect(await screen.findByText('رسالة جديدة')).toBeInTheDocument();
      expect(screen.getByText('محتوى الرسالة')).toBeInTheDocument();
    });
  });

  describe('row navigation (hrefFor)', () => {
    it('renders NEW_MESSAGE with a conversationId as a link to the conversation', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          items: [
            makeNotification({
              type: 'NEW_MESSAGE',
              title: 'رسالة جديدة',
              data: { conversationId: 'conv-1' },
            }),
          ],
        },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      const link = (await screen.findByText('رسالة جديدة')).closest('a');
      expect(link).toHaveAttribute('href', '/messages/conv-1');
    });

    it('renders FAV_AD_PRICE_CHANGED with an adId as a link to the ad', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          items: [
            makeNotification({
              type: 'FAV_AD_PRICE_CHANGED',
              title: 'تغيير سعر',
              data: { adId: 'ad-1' },
            }),
          ],
        },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      const link = (await screen.findByText('تغيير سعر')).closest('a');
      expect(link).toHaveAttribute('href', '/ads/ad-1');
    });

    it('renders a PROMOTION (no adId) as a plain button, not a link', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          items: [makeNotification({ type: 'PROMOTION', title: 'عرض ترويجي', data: null })],
        },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      const row = await screen.findByText('عرض ترويجي');
      expect(row.closest('a')).toBeNull();
      expect(row.closest('button')).not.toBeNull();
    });

    it('renders NEW_MESSAGE with NO conversationId as a plain button (no href for missing data)', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          items: [makeNotification({ type: 'NEW_MESSAGE', title: 'رسالة بلا رابط', data: null })],
        },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      const row = await screen.findByText('رسالة بلا رابط');
      expect(row.closest('a')).toBeNull();
    });

    // PROMO-1 (Phase 14): always links to the promotions dashboard
    // regardless of which of the three lifecycle events (started/
    // expiring/expired) fired — see hrefFor's own comment on why no
    // per-event distinction is needed here.
    it('renders PROMOTION_STATUS_CHANGE as a link to the promotions dashboard', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          items: [
            makeNotification({
              type: 'PROMOTION_STATUS_CHANGE',
              title: 'بدأ عرضك',
              data: { promotionId: 'promo-1', productId: 'product-1', event: 'started' },
            }),
          ],
        },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      const link = (await screen.findByText('بدأ عرضك')).closest('a');
      expect(link).toHaveAttribute('href', '/my-store/promotions');
    });

    it('renders PROMOTION_STATUS_CHANGE as a link even without data (still a known type, unlike PROMOTION)', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          items: [makeNotification({ type: 'PROMOTION_STATUS_CHANGE', title: 'انتهى عرضك', data: null })],
        },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      const link = (await screen.findByText('انتهى عرضك')).closest('a');
      expect(link).toHaveAttribute('href', '/my-store/promotions');
    });
  });

  describe('mark as read', () => {
    it('marks an unread row read on click', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          items: [makeNotification({ id: 'n-1', type: 'PROMOTION', title: 'غير مقروء', readAt: null })],
        },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      await user.click(await screen.findByText('غير مقروء'));

      expect(mockMarkReadMutate).toHaveBeenCalledWith('n-1');
    });

    it('does not call markRead again when clicking an already-read row', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          items: [
            makeNotification({
              id: 'n-2',
              type: 'PROMOTION',
              title: 'مقروء بالفعل',
              readAt: new Date().toISOString(),
            }),
          ],
        },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      await user.click(await screen.findByText('مقروء بالفعل'));

      expect(mockMarkReadMutate).not.toHaveBeenCalled();
    });

    // CONV-READ FIX: clicking one NEW_MESSAGE notification also marks
    // every other unread NEW_MESSAGE row sharing the same
    // conversationId — see NotificationBell's handleNotificationClick.
    describe('conversation-scoped mark-read for NEW_MESSAGE', () => {
      function sameConversationBurst(): Notification[] {
        return [
          makeNotification({
            id: 'm-1', type: 'NEW_MESSAGE', title: 'رسالة 1', data: { conversationId: 'conv-1' },
          }),
          makeNotification({
            id: 'm-2', type: 'NEW_MESSAGE', title: 'رسالة 2', data: { conversationId: 'conv-1' },
          }),
          // Different conversation — must NOT be marked read by the click below.
          makeNotification({
            id: 'm-3', type: 'NEW_MESSAGE', title: 'رسالة أخرى', data: { conversationId: 'conv-2' },
          }),
          // Same conversationId but already read — must NOT be re-sent
          // to the mutation (mirrors the "already-read" test above).
          makeNotification({
            id: 'm-4', type: 'NEW_MESSAGE', title: 'رسالة مقروءة سلفاً',
            data: { conversationId: 'conv-1' }, readAt: new Date().toISOString(),
          }),
        ];
      }

      it('marks every other unread NEW_MESSAGE row in the same conversation as read', async () => {
        (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
          data: { items: sameConversationBurst() },
          isLoading: false,
        });
        const user = setupUser();
        render(<NotificationBell />);
        await openMenu(user);

        await user.click(await screen.findByText('رسالة 1'));

        expect(mockMarkReadMutate).toHaveBeenCalledWith('m-1');
        expect(mockMarkReadMutate).toHaveBeenCalledWith('m-2');
        expect(mockMarkReadMutate).toHaveBeenCalledTimes(2);
      });

      it('does not mark a NEW_MESSAGE row from a different conversation', async () => {
        (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
          data: { items: sameConversationBurst() },
          isLoading: false,
        });
        const user = setupUser();
        render(<NotificationBell />);
        await openMenu(user);

        await user.click(await screen.findByText('رسالة 1'));

        expect(mockMarkReadMutate).not.toHaveBeenCalledWith('m-3');
      });

      it('does not re-send an already-read sibling in the same conversation', async () => {
        (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
          data: { items: sameConversationBurst() },
          isLoading: false,
        });
        const user = setupUser();
        render(<NotificationBell />);
        await openMenu(user);

        await user.click(await screen.findByText('رسالة 1'));

        expect(mockMarkReadMutate).not.toHaveBeenCalledWith('m-4');
      });

      it('does not pull in other notification types even if unread', async () => {
        (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
          data: {
            items: [
              makeNotification({ id: 'm-1', type: 'NEW_MESSAGE', title: 'رسالة 1', data: { conversationId: 'conv-1' } }),
              makeNotification({ id: 'p-1', type: 'PROMOTION', title: 'عرض غير مرتبط', data: null }),
            ],
          },
          isLoading: false,
        });
        const user = setupUser();
        render(<NotificationBell />);
        await openMenu(user);

        await user.click(await screen.findByText('رسالة 1'));

        expect(mockMarkReadMutate).toHaveBeenCalledWith('m-1');
        expect(mockMarkReadMutate).not.toHaveBeenCalledWith('p-1');
        expect(mockMarkReadMutate).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('mark all as read', () => {
    it('does not render "mark all as read" when unread count is 0', async () => {
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      expect(await screen.findByText('الإشعارات')).toBeInTheDocument();
      expect(screen.queryByText('تعليم الكل كمقروء')).not.toBeInTheDocument();
    });

    it('renders and calls the mutation when clicked', async () => {
      (useUnreadNotificationCount as ReturnType<typeof vi.fn>).mockReturnValue({ data: 3 });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      await user.click(await screen.findByText('تعليم الكل كمقروء'));

      expect(mockMarkAllReadMutate).toHaveBeenCalledTimes(1);
    });

    it('disables the button while the mutation is pending', async () => {
      (useUnreadNotificationCount as ReturnType<typeof vi.fn>).mockReturnValue({ data: 3 });
      (useMarkAllNotificationsRead as ReturnType<typeof vi.fn>).mockReturnValue({
        mutate: mockMarkAllReadMutate,
        isPending: true,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      expect(await screen.findByText('تعليم الكل كمقروء')).toBeDisabled();
    });
  });

  describe('grouping consecutive same-type notifications', () => {
    function threeConsecutive(): Notification[] {
      return [
        makeNotification({ id: 'g-1', type: 'FAV_AD_PRICE_CHANGED', title: 'تغيير 1', data: { adId: 'a1' } }),
        makeNotification({ id: 'g-2', type: 'FAV_AD_PRICE_CHANGED', title: 'تغيير 2', data: { adId: 'a2' } }),
        makeNotification({ id: 'g-3', type: 'FAV_AD_PRICE_CHANGED', title: 'تغيير 3', data: { adId: 'a3' } }),
      ];
    }

    it('collapses 3+ consecutive same-type notifications into one group row', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { items: threeConsecutive() },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      expect(await screen.findByText('تغييرات في الأسعار (3)')).toBeInTheDocument();
      expect(screen.queryByText('تغيير 1')).not.toBeInTheDocument();
    });

    it('expands the group to show individual rows when clicked', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { items: threeConsecutive() },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      await user.click(await screen.findByText('تغييرات في الأسعار (3)'));

      expect(screen.getByText('تغيير 1')).toBeInTheDocument();
      expect(screen.getByText('تغيير 2')).toBeInTheDocument();
      expect(screen.getByText('تغيير 3')).toBeInTheDocument();
    });

    it('does NOT collapse a run of only 2 same-type notifications', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          items: [
            makeNotification({ id: 'p-1', type: 'PROMOTION', title: 'عرض أ' }),
            makeNotification({ id: 'p-2', type: 'PROMOTION', title: 'عرض ب' }),
          ],
        },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      expect(await screen.findByText('عرض أ')).toBeInTheDocument();
      expect(screen.getByText('عرض ب')).toBeInTheDocument();
      expect(screen.queryByText(/إعلانات ترويجية \(/)).not.toBeInTheDocument();
    });

    it('does not merge non-consecutive same-type runs across an interrupting different type', async () => {
      (useMyNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          items: [
            makeNotification({ id: 'a-1', type: 'PROMOTION', title: 'ترويج أ' }),
            makeNotification({ id: 'a-2', type: 'PROMOTION', title: 'ترويج ب' }),
            makeNotification({ id: 'a-3', type: 'PROMOTION', title: 'ترويج ج' }),
            makeNotification({ id: 'b-1', type: 'NEW_MESSAGE', title: 'رسالة فاصلة' }),
            makeNotification({ id: 'a-4', type: 'PROMOTION', title: 'ترويج د' }),
          ],
        },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationBell />);
      await openMenu(user);

      // First run of 3 collapses into a group; the interrupting
      // NEW_MESSAGE and the trailing single PROMOTION each render
      // individually rather than joining the earlier group.
      expect(await screen.findByText('إعلانات ترويجية (3)')).toBeInTheDocument();
      expect(screen.getByText('رسالة فاصلة')).toBeInTheDocument();
      expect(screen.getByText('ترويج د')).toBeInTheDocument();
    });
  });
});
