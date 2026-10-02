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
import { setupUser } from '@/test-support/user-event';
import { PushNotificationToggle } from '@/components/pwa/PushNotificationToggle';
import {
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSupported,
} from '@/lib/pwa';
import { toast } from 'sonner';
import { isNativePlatform } from '@/lib/capacitor/platform';
import {
  getNativePushPermissionState,
  registerNativePush,
  unregisterNativePush,
} from '@/lib/capacitor/nativePush';
import { setPushOptedOut } from '@/lib/runtime/pushPreference';

vi.mock('@/lib/pwa', () => ({
  getPushSubscriptionState: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
  isPushSupported: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/capacitor/platform', () => ({
  isNativePlatform: vi.fn(async () => false),
}));

vi.mock('@/lib/capacitor/nativePush', () => ({
  NATIVE_FCM_TOKEN_STORAGE_KEY: 'push:native-fcm-token',
  getNativePushPermissionState: vi.fn(async () => 'unsupported'),
  registerNativePush: vi.fn(async () => null),
  unregisterNativePush: vi.fn(async () => undefined),
}));

// PUSH-TOKEN-STORAGE-01: the component now reads/writes the FCM token and
// the opt-out flag through secureStorage (same store as nativePush.ts).
const secureMem = new Map<string, string>();
vi.mock('@/lib/runtime/secureStorage', () => ({
  secureGet: vi.fn(async (k: string) => secureMem.get(k) ?? null),
  secureSet: vi.fn(async (k: string, v: string) => {
    secureMem.set(k, v);
  }),
  secureRemove: vi.fn(async (k: string) => {
    secureMem.delete(k);
  }),
}));

vi.mock('@/lib/runtime/pushPreference', () => ({
  isPushOptedOut: vi.fn(async () => false),
  setPushOptedOut: vi.fn(async () => undefined),
}));

const mockGetState = vi.mocked(getPushSubscriptionState);
const mockSubscribe = vi.mocked(subscribeToPush);
const mockUnsubscribe = vi.mocked(unsubscribeFromPush);
const mockIsSupported = vi.mocked(isPushSupported);

describe('PushNotificationToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secureMem.clear();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-vapid-key');
    mockIsSupported.mockReturnValue(true);
    vi.mocked(isNativePlatform).mockResolvedValue(false);
    vi.mocked(getNativePushPermissionState).mockResolvedValue('unsupported');
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
    const user = setupUser();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'تفعيل' }));

    await waitFor(() => expect(screen.getByText('مفعّلة حاليًا')).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('تم تفعيل إشعارات الجهاز');
  });

  it('shows an error toast and stays unsubscribed when the browser denies permission', async () => {
    mockGetState.mockResolvedValue('unsubscribed');
    mockSubscribe.mockResolvedValue(false);
    const user = setupUser();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'تفعيل' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('لم يتم منح إذن الإشعارات'));
    expect(screen.getByText('غير مفعّلة')).toBeInTheDocument();
  });

  it('unsubscribes on click when currently subscribed, showing a success toast', async () => {
    mockGetState.mockResolvedValue('subscribed');
    mockUnsubscribe.mockResolvedValue(undefined);
    const user = setupUser();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'إيقاف' }));

    await waitFor(() => expect(screen.getByText('غير مفعّلة')).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('تم إيقاف إشعارات الجهاز');
  });

  it('shows an error toast and re-resolves the real state when toggling throws', async () => {
    mockGetState.mockResolvedValueOnce('unsubscribed').mockResolvedValueOnce('unsubscribed');
    mockSubscribe.mockRejectedValue(new Error('network error'));
    const user = setupUser();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'تفعيل' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('تعذّر تحديث إعدادات الإشعارات'));
    expect(mockGetState).toHaveBeenCalledTimes(2);
  });

  it('disables the button while a toggle is in flight', async () => {
    mockGetState.mockResolvedValue('unsubscribed');
    mockSubscribe.mockReturnValue(new Promise(() => {})); // never resolves
    const user = setupUser();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'تفعيل' }));
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('uses registerNativePush on activate when native', async () => {
    vi.mocked(isNativePlatform).mockResolvedValue(true);
    vi.mocked(getNativePushPermissionState).mockResolvedValue('prompt');
    vi.mocked(registerNativePush).mockResolvedValue('fcm-token-1');
    const user = setupUser();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'تفعيل' }));

    await waitFor(() => expect(registerNativePush).toHaveBeenCalled());
    expect(subscribeToPush).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('تم تفعيل إشعارات الجهاز');
    expect(secureMem.get('push:native-fcm-token')).toBe('fcm-token-1');
    expect(setPushOptedOut).toHaveBeenCalledWith(false);
  });

  it('uses unregisterNativePush on deactivate when native', async () => {
    vi.mocked(isNativePlatform).mockResolvedValue(true);
    vi.mocked(getNativePushPermissionState).mockResolvedValue('granted');
    secureMem.set('push:native-fcm-token', 'fcm-token-1');
    vi.mocked(unregisterNativePush).mockResolvedValue(undefined);
    const user = setupUser();
    render(<PushNotificationToggle />);

    await user.click(await screen.findByRole('button', { name: 'إيقاف' }));

    await waitFor(() => expect(unregisterNativePush).toHaveBeenCalledWith('fcm-token-1'));
    expect(unsubscribeFromPush).not.toHaveBeenCalled();
    expect(secureMem.has('push:native-fcm-token')).toBe(false);
    expect(setPushOptedOut).toHaveBeenCalledWith(true);
  });
});
