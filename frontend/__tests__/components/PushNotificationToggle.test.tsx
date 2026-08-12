/**
 * __tests__/components/PushNotificationToggle.test.tsx
 *
 * Real logic under test: falls back to the "unsupported" panel when
 * either the browser API is unavailable OR the VAPID key env var is
 * missing (still-incomplete backend wiring — see file header), the
 * subscribe/unsubscribe toggle flow with success/failure toasts, and
 * FIX PWA-CRITICAL-05: the initial 'loading' state must render a
 * neutral "جارٍ التحقق…" — not flash as "غير مفعّلة" — while the real
 * subscription state is still being resolved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PushNotificationToggle } from '@/components/pwa/PushNotificationToggle';
import {
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSupported,
} from '@/lib/pwa';
import { toast } from 'sonner';

vi.mock('@/lib/pwa', () => ({
  getPushSubscriptionState: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
  isPushSupported: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockGetState = vi.mocked(getPushSubscriptionState);
const mockSubscribe = vi.mocked(subscribeToPush);
const mockUnsubscribe = vi.mocked(unsubscribeFromPush);
const mockIsSupported = vi.mocked(isPushSupported);

describe('PushNotificationToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-vapid-key');
    mockIsSupported.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the unsupported panel when the browser does not support push', async () => {
    mockIsSupported.mockReturnValue(false);
    render(<PushNotificationToggle />);
    expect(await screen.findByText('إشعارات الجهاز غير مدعومة على هذا المتصفح/الجهاز حاليًا.')).toBeInTheDocument();
  });

  it('shows the unsupported panel when the VAPID key env var is missing, even if the browser supports push', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '');
    mockGetState.mockResolvedValue('unsubscribed');
    render(<PushNotificationToggle />);
    expect(await screen.findByText('إشعارات الجهاز غير مدعومة على هذا المتصفح/الجهاز حاليًا.')).toBeInTheDocument();
  });

  it('falls back to unsupported when getPushSubscriptionState rejects', async () => {
    mockGetState.mockRejectedValue(new Error('boom'));
    render(<PushNotificationToggle />);
    expect(await screen.findByText('إشعارات الجهاز غير مدعومة على هذا المتصفح/الجهاز حاليًا.')).toBeInTheDocument();
  });

  it('shows a neutral "جارٍ التحقق…" label, not "غير مفعّلة", while state is loading (FIX PWA-CRITICAL-05)', () => {
    mockGetState.mockReturnValue(new Promise(() => {})); // never resolves
    render(<PushNotificationToggle />);
    expect(screen.getByText('جارٍ التحقق…')).toBeInTheDocument();
    expect(screen.queryByText('غير مفعّلة')).not.toBeInTheDocument();
  });

  it('shows "غير مفعّلة" and a "تفعيل" button once resolved to unsubscribed', async () => {
    mockGetState.mockResolvedValue('unsubscribed');
    render(<PushNotificationToggle />);
    expect(await screen.findByText('غير مفعّلة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تفعيل' })).toBeInTheDocument();
  });

  it('shows "مفعّلة حاليًا" and an "إيقاف" button once resolved to subscribed', async () => {
    mockGetState.mockResolvedValue('subscribed');
    render(<PushNotificationToggle />);
    expect(await screen.findByText('مفعّلة حاليًا')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إيقاف' })).toBeInTheDocument();
  });

  it('subscribes on click when currently unsubscribed, showing a success toast', async () => {
    mockGetState.mockResolvedValue('unsubscribed');
    mockSubscribe.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'تفعيل' }));

    await waitFor(() => expect(screen.getByText('مفعّلة حاليًا')).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('تم تفعيل إشعارات الجهاز');
  });

  it('shows an error toast and stays unsubscribed when the browser denies permission', async () => {
    mockGetState.mockResolvedValue('unsubscribed');
    mockSubscribe.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'تفعيل' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('لم يتم منح إذن الإشعارات'));
    expect(screen.getByText('غير مفعّلة')).toBeInTheDocument();
  });

  it('unsubscribes on click when currently subscribed, showing a success toast', async () => {
    mockGetState.mockResolvedValue('subscribed');
    mockUnsubscribe.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'إيقاف' }));

    await waitFor(() => expect(screen.getByText('غير مفعّلة')).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('تم إيقاف إشعارات الجهاز');
  });

  it('shows an error toast and re-resolves the real state when toggling throws', async () => {
    mockGetState.mockResolvedValueOnce('unsubscribed').mockResolvedValueOnce('unsubscribed');
    mockSubscribe.mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'تفعيل' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('تعذّر تحديث إعدادات الإشعارات'));
    expect(mockGetState).toHaveBeenCalledTimes(2);
  });

  it('disables the button while a toggle is in flight', async () => {
    mockGetState.mockResolvedValue('unsubscribed');
    mockSubscribe.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'تفعيل' }));
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
