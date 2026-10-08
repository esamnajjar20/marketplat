import { reportBackgroundFailure } from '../backgroundTask';
/**
 * Native push notifications via @capacitor/push-notifications + FCM.
 *
 * lib/pwa.ts implements Web Push (VAPID) — untouched. This is a separate
 * additive path for the Capacitor shell: Web Push through an Android
 * WebView PushManager is not reliable for background delivery.
 *
 * PushNotificationToggle.tsx branches:
 *   isNativePlatform() ? registerNativePush() : subscribeToPush()
 *
 * Backend: POST/DELETE /notifications/fcm-tokens
 */
import { apiClient } from '@/api/client';
import { getNativePlatformName, isNativePlatform } from './platform';
import { secureGet, secureSet } from '@/lib/runtime/secureStorage';
import { isPushOptedOut } from '@/lib/runtime/pushPreference';

/** Shared with PushNotificationToggle + authCleanup — FCM device token. */
export const NATIVE_FCM_TOKEN_STORAGE_KEY = 'push:native-fcm-token';

export async function isNativePushSupported(): Promise<boolean> {
  return isNativePlatform();
}

/**
 * Non-prompting permission check for the settings toggle's initial render.
 * Returns 'unsupported' on web/SSR.
 */
export async function getNativePushPermissionState(): Promise<
  'granted' | 'denied' | 'prompt' | 'unsupported'
> {
  if (!(await isNativePlatform())) return 'unsupported';
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'granted') return 'granted';
  if (permission.receive === 'denied') return 'denied';
  return 'prompt';
}

/**
 * Requests permission (if needed), registers with FCM, and sends the
 * device token to the backend. Returns the token on success, null if
 * denied or not native.
 */
export async function registerNativePush(): Promise<string | null> {
  if (!(await isNativePlatform())) return null;

  const { PushNotifications } = await import('@capacitor/push-notifications');

  const permission = await PushNotifications.checkPermissions();
  let status = permission.receive;
  if (status !== 'granted') {
    status = (await PushNotifications.requestPermissions()).receive;
  }
  if (status !== 'granted') return null;

  // FIX NATIVEPUSH-LISTENER-LEAK + TIMEOUT:
  //  1) listeners كانت تتراكم مع كل استدعاء (toggle/ensureSynced) بلا إزالة.
  //  2) FCM قد لا يستجيب أبدًا (شبكة/إعداد خاطئ) → Promise يعلق للأبد.
  // الحل: tracked handles + settled flag + 30s timeout + cleanup في finally.
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolveOnce: (v: string | null) => void = () => {};
  let rejectOnce: (e: unknown) => void = () => {};

  const promise = new Promise<string | null>((resolve, reject) => {
    resolveOnce = (v) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(v);
    };
    rejectOnce = (e) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(e);
    };
    timer = setTimeout(
      () => rejectOnce(new Error('FCM registration timeout (30s)')),
      30_000,
    );
  });

  const handles = await Promise.all([
    PushNotifications.addListener('registration', (token) => {
      void (async () => {
        const platform = await getNativePlatformName();
        // Backend expects android | ios; never send 'web' from native path.
        const platformLabel = platform === 'ios' ? 'ios' : 'android';
        try {
          await apiClient.post('/notifications/fcm-tokens', {
            token: token.value,
            platform: platformLabel,
          });
          resolveOnce(token.value);
        } catch (err) {
          rejectOnce(err);
        }
      })();
    }),
    PushNotifications.addListener('registrationError', (err) => {
      rejectOnce(new Error(err.error || 'FCM registration failed'));
    }),
  ]);

  void PushNotifications.register();

  return promise.finally(() => {
    if (timer) clearTimeout(timer);
    handles.forEach((h) => {
      void h.remove();
    });
  });
}

/**
 * Silent sync after login (mirrors ensurePushSubscriptionSynced for Web Push):
 * - does not prompt if permission is not already granted
 * - if granted → re-register and POST token (handles DB row loss / account switch)
 * - persists token under NATIVE_FCM_TOKEN_STORAGE_KEY for logout cleanup
 * - never throws to the UI
 */
export async function ensureNativePushSynced(): Promise<'synced' | 'subscribed' | 'skipped'> {
  if (!(await isNativePlatform())) return 'skipped';

  try {
    const state = await getNativePushPermissionState();
    if (state !== 'granted') return 'skipped';
    // PUSH-OPTOUT-01: المستخدم أوقفها عمدًا — إذن النظام وحده لا يكفي.
    if (await isPushOptedOut()) return 'skipped';

    const previous = await secureGet(NATIVE_FCM_TOKEN_STORAGE_KEY);

    const token = await registerNativePush();
    if (!token) return 'skipped';

    await secureSet(NATIVE_FCM_TOKEN_STORAGE_KEY, token);

    return previous === token ? 'synced' : 'subscribed';
  } catch {
    return 'skipped';
  }
}

/**
 * Best-effort: removes the current device's token from the backend.
 */
export async function unregisterNativePush(deviceToken: string): Promise<void> {
  if (!(await isNativePlatform())) return;
  await apiClient
    .delete('/notifications/fcm-tokens', { data: { token: deviceToken } })
    .catch((error) => reportBackgroundFailure('frontend/lib/capacitor/nativePush.ts', error));
}

export interface NativePushNotification {
  title?: string;
  body?: string;
  url?: string;
}

/**
 * Foreground/background notification tap → same intent as sw.js
 * notificationclick for the web push path.
 */
export async function onNativePushTapped(
  handler: (notification: NativePushNotification) => void,
): Promise<() => void> {
  if (!(await isNativePlatform())) return () => {};

  const { PushNotifications } = await import('@capacitor/push-notifications');
  const listener = await PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action) => {
      const data = action.notification.data as { url?: string } | undefined;
      handler({
        title: action.notification.title,
        body: action.notification.body,
        url: data?.url,
      });
    },
  );

  return () => {
    void listener.remove();
  };
}
