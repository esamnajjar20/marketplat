/**
 * NEW — native push notifications via @capacitor/push-notifications + FCM.
 *
 * lib/pwa.ts already implements a full, working Web Push (VAPID) flow —
 * that code is untouched. This is a separate, additive path for the
 * Capacitor shell specifically: standard Web Push delivered through an
 * Android WebView's own PushManager is not reliable for background
 * delivery (the WebView has no persistent background process the way
 * a native FCM listener does — this is a known Android WebView
 * limitation, not something this codebase can fix from JS). The plan
 * explicitly calls for "Firebase/FCM عبر Capacitor" for that reason.
 *
 * Mirrors lib/pwa.ts's subscribeToPush/unsubscribeFromPush shape
 * (register → POST token to backend; unregister → DELETE) so
 * PushNotificationToggle.tsx can call whichever of the two is
 * appropriate for the current platform — see that component for the
 * suggested `isNativePlatform() ? registerNativePush() : subscribeToPush()`
 * branch (not yet wired in; toggle left untouched here, see
 * README-CAPACITOR.md).
 *
 * Backend counterpart: POST/DELETE /notifications/fcm-tokens
 * (backend/src/modules/notifications/ — added alongside this file).
 * Requires a Firebase project + google-services.json placed at
 * android/app/google-services.json — see README-CAPACITOR.md.
 */
import { apiClient } from '@/api/client';
import { isNativePlatform } from './platform';

export async function isNativePushSupported(): Promise<boolean> {
  return isNativePlatform();
}

/**
 * WIRING: non-prompting permission check for the settings toggle's
 * initial render (PushNotificationToggle.tsx) — mirrors the
 * "checkPermissions before ever prompting" posture used everywhere
 * else in lib/capacitor/. Returns 'unsupported' on web/SSR.
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
 * Requests permission, registers with FCM, and sends the resulting
 * device token to the backend. Returns the device token on success so
 * the caller can persist it for a later unregisterNativePush() call
 * (this module intentionally holds no state of its own — see
 * platform.ts's dynamic-import rationale for why nothing here is a
 * module-level singleton). Returns null (no throw) if the user denies
 * permission or this isn't running natively.
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

  return new Promise<string | null>((resolve, reject) => {
    // 'registration' fires once FCM hands back a device token.
    PushNotifications.addListener('registration', (token) => {
      apiClient
        .post('/notifications/fcm-tokens', { token: token.value, platform: 'android' })
        .then(() => resolve(token.value))
        .catch((err) => reject(err));
    });

    PushNotifications.addListener('registrationError', (err) => {
      reject(new Error(err.error || 'FCM registration failed'));
    });

    void PushNotifications.register();
  });
}

/**
 * Best-effort: removes the current device's token from the backend.
 * Does not (and cannot, via this plugin) revoke the token with FCM
 * itself — matches lib/pwa.ts's unsubscribeFromPush's own
 * "local action is authoritative, server cleanup is best-effort" note.
 */
export async function unregisterNativePush(deviceToken: string): Promise<void> {
  if (!(await isNativePlatform())) return;
  await apiClient
    .delete('/notifications/fcm-tokens', { data: { token: deviceToken } })
    .catch(() => undefined);
}

export interface NativePushNotification {
  title?: string;
  body?: string;
  url?: string;
}

/**
 * Registers a foreground-tap handler (user taps a notification while
 * the app is open/backgrounded) and routes to `url` if present — same
 * intent as sw.js's existing 'notificationclick' handler for the web
 * push path.
 */
export async function onNativePushTapped(
  handler: (notification: NativePushNotification) => void
): Promise<() => void> {
  if (!(await isNativePlatform())) return () => {};

  const { PushNotifications } = await import('@capacitor/push-notifications');
  const listener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification.data as { url?: string } | undefined;
    handler({
      title: action.notification.title,
      body: action.notification.body,
      url: data?.url,
    });
  });

  return () => {
    void listener.remove();
  };
}
