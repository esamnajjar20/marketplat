/**
 * __tests__/components/NotificationToasts.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { NotificationToasts } from '@/components/notifications/NotificationToasts';
import { useNotificationStream } from '@/hooks/useNotificationStream';
import { toast } from 'sonner';
import { ROUTES } from '@/lib/constants';

vi.mock('@/hooks/useNotificationStream', () => ({
  useNotificationStream: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('NotificationToasts', () => {
  let onEvent: ((event: {
    type: string;
    action?: string;
    notificationType?: string;
    title?: string;
    body?: string;
  }) => void) | undefined;

  beforeEach(() => {
    mockPush.mockReset();
    vi.mocked(toast).mockReset();
    onEvent = undefined;

    vi.mocked(useNotificationStream).mockImplementation((opts) => {
      onEvent = opts?.onEvent;
      return { status: 'open' } as never;
    });
  });

  it('renders null (no visible UI)', () => {
    const { container } = render(<NotificationToasts />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows toast for critical NEW_MESSAGE created events', () => {
    render(<NotificationToasts />);

    onEvent?.({
      type: 'notification',
      action: 'created',
      notificationType: 'NEW_MESSAGE',
      title: 'رسالة جديدة',
      body: 'من أحمد',
    });

    expect(toast).toHaveBeenCalledWith(
      'رسالة جديدة',
      expect.objectContaining({
        description: 'من أحمد',
        action: expect.objectContaining({ label: 'عرض' }),
      }),
    );
  });

  it('navigates to messages for NEW_MESSAGE action click', () => {
    render(<NotificationToasts />);

    onEvent?.({
      type: 'notification',
      action: 'created',
      notificationType: 'NEW_MESSAGE',
      title: 'رسالة',
      body: 'نص',
    });

    const action = (vi.mocked(toast).mock.calls[0][1] as { action: { onClick: () => void } }).action;
    action.onClick();
    expect(mockPush).toHaveBeenCalledWith(ROUTES.messages);
  });

  it('deep-links NEW_MESSAGE to the exact conversation when data is present', () => {
    render(<NotificationToasts />);

    onEvent?.({
      type: 'notification',
      action: 'created',
      notificationType: 'NEW_MESSAGE',
      title: 'رسالة',
      body: 'نص',
      data: { conversationId: 'conv-9' },
    } as never);

    const action = (vi.mocked(toast).mock.calls[0][1] as { action: { onClick: () => void } }).action;
    action.onClick();
    expect(mockPush).toHaveBeenCalledWith(ROUTES.conversationDetail('conv-9'));
  });

  it('deep-links FAV_AD_SOLD to the ad', () => {
    render(<NotificationToasts />);

    onEvent?.({
      type: 'notification',
      action: 'created',
      notificationType: 'FAV_AD_SOLD',
      title: 'بيع',
      body: 'x',
      data: { adId: 'ad-3' },
    } as never);

    const action = (vi.mocked(toast).mock.calls[0][1] as { action: { onClick: () => void } }).action;
    action.onClick();
    expect(mockPush).toHaveBeenCalledWith(ROUTES.adDetail('ad-3'));
  });

  it('skips the toast when the user is already on the target page', () => {
    window.history.pushState({}, '', ROUTES.conversationDetail('conv-open'));
    render(<NotificationToasts />);

    onEvent?.({
      type: 'notification',
      action: 'created',
      notificationType: 'NEW_MESSAGE',
      title: 'رسالة',
      body: 'نص',
      data: { conversationId: 'conv-open' },
    } as never);

    expect(toast).not.toHaveBeenCalled();
    window.history.pushState({}, '', '/');
  });

  it('ignores non-notification stream events', () => {
    render(<NotificationToasts />);

    onEvent?.({ type: 'message:new', action: 'created' });
    expect(toast).not.toHaveBeenCalled();
  });

  it('ignores non-critical notification types', () => {
    render(<NotificationToasts />);

    onEvent?.({
      type: 'notification',
      action: 'created',
      notificationType: 'WEEKLY_AD_VIEWS_REPORT',
      title: 'تقرير',
    });

    expect(toast).not.toHaveBeenCalled();
  });

  it('toasts FAV_AD_SOLD and links to notifications page', () => {
    render(<NotificationToasts />);

    onEvent?.({
      type: 'notification',
      action: 'updated',
      notificationType: 'FAV_AD_SOLD',
      title: 'تم البيع',
      body: 'إعلانك',
    });

    expect(toast).toHaveBeenCalled();
    const action = (vi.mocked(toast).mock.calls[0][1] as { action: { onClick: () => void } }).action;
    action.onClick();
    expect(mockPush).toHaveBeenCalledWith(ROUTES.notifications);
  });
});
