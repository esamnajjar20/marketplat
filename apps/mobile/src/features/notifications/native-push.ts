import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { apiRequest } from '@/api/client';
import { colors } from '@/theme/tokens';

const ANDROID_PUSH_OPT_IN_KEY = 'marketplat.mobile.android-push-opt-in.v1';
const ANDROID_PUSH_TOKEN_KEY = 'marketplat.mobile.android-push-token.v1';

export type NativePushPlatform = 'android';

export async function isAndroidPushEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return (await SecureStore.getItemAsync(ANDROID_PUSH_OPT_IN_KEY)) === 'true';
  } catch {
    // Fail closed: an unreadable opt-in state must not silently subscribe a device.
    return false;
  }
}

async function saveAndroidPushState(enabled: boolean, token?: string): Promise<void> {
  if (enabled && token) {
    await SecureStore.setItemAsync(ANDROID_PUSH_TOKEN_KEY, token);
    await SecureStore.setItemAsync(ANDROID_PUSH_OPT_IN_KEY, 'true');
    return;
  }
  await SecureStore.deleteItemAsync(ANDROID_PUSH_OPT_IN_KEY);
  await SecureStore.deleteItemAsync(ANDROID_PUSH_TOKEN_KEY);
}

export async function clearRegisteredAndroidPushState(): Promise<void> {
  await saveAndroidPushState(false);
}

export async function getRegisteredAndroidFcmToken(): Promise<string | null> {
  if (Platform.OS !== 'android' || !(await isAndroidPushEnabled())) return null;
  try {
    const token = await SecureStore.getItemAsync(ANDROID_PUSH_TOKEN_KEY);
    return token && token.length <= 500 ? token : null;
  } catch {
    return null;
  }
}

async function getAndroidFcmToken(): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('تسجيل الإشعارات الأصلية متاح حاليًا على Android فقط؛ خادم الإرسال يتطلب FCM token وليس APNs token.');
  }
  if (!Device.isDevice) {
    throw new Error('اختبر الإشعارات على جهاز Android فعلي أو محاكي يدعم Google Play Services.');
  }

  let nativeToken: Awaited<ReturnType<typeof Notifications.getDevicePushTokenAsync>>;
  try {
    nativeToken = await Notifications.getDevicePushTokenAsync();
  } catch (error) {
    const details = error instanceof Error ? error.message : 'تعذّر تهيئة مزوّد الإشعارات.';
    throw new Error(
      `تعذّر الحصول على رمز FCM. أضف ملف Firebase الخاص بالتطبيق إلى apps/mobile/google-services.json (أو android/app/google-services.json) ثم أعد بناء Android. التفاصيل: ${details}`,
    );
  }
  if (String(nativeToken.type).toLowerCase() !== 'fcm') {
    throw new Error('لم يُرجع Android رمز FCM صالحًا. تحقق من إعداد Firebase الخاص بتطبيق Android.');
  }
  const token = typeof nativeToken.data === 'string' ? nativeToken.data.trim() : '';
  if (!token || token.length > 500) throw new Error('رمز FCM الذي أعاده النظام غير صالح.');
  return token;
}

async function sendFcmToken(accessToken: string, csrfToken: string | null | undefined, token: string): Promise<void> {
  await apiRequest('/api/v1/notifications/fcm-tokens', {
    method: 'POST',
    token: accessToken,
    ...(csrfToken ? { headers: { 'X-CSRF-Token': csrfToken } } : {}),
    body: JSON.stringify({ token, platform: 'android' }),
  });
}

async function deleteFcmToken(accessToken: string, csrfToken: string | null | undefined, token: string): Promise<void> {
  await apiRequest('/api/v1/notifications/fcm-tokens', {
    method: 'DELETE',
    token: accessToken,
    ...(csrfToken ? { headers: { 'X-CSRF-Token': csrfToken } } : {}),
    body: JSON.stringify({ token }),
  });
}

export async function unregisterFcmTokenValue(
  accessToken: string,
  csrfToken: string | null | undefined,
  token: string,
): Promise<void> {
  if (!token || token.length > 500) return;
  await deleteFcmToken(accessToken, csrfToken, token);
}

export async function registerAndroidFcmToken(
  accessToken: string,
  csrfToken?: string | null,
  tokenOverride?: string,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  const token = tokenOverride?.trim() || await getAndroidFcmToken();
  if (!token || token.length > 500) throw new Error('رمز FCM غير صالح.');
  await sendFcmToken(accessToken, csrfToken, token);
  if (await isAndroidPushEnabled()) await saveAndroidPushState(true, token);
}

/** Ask only after an explicit user action; never prompt from the app boot path. */
export async function requestAndRegisterAndroidPush(
  accessToken: string,
  csrfToken?: string | null,
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('الإشعارات الفورية على iOS غير مفعلة بعد؛ مسار الخادم الحالي يرسل رموز FCM فقط.');
  }
  if (!Device.isDevice) throw new Error('يلزم جهاز Android فعلي لاختبار إشعارات FCM.');

  await Notifications.setNotificationChannelAsync('default', {
    name: 'إشعارات MarketPlat',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: colors.brand,
  });

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('لم يتم منح إذن الإشعارات. يمكنك تفعيله لاحقًا من إعدادات الجهاز.');

  const token = await getAndroidFcmToken();
  await sendFcmToken(accessToken, csrfToken, token);
  try {
    await saveAndroidPushState(true, token);
  } catch (error) {
    // Do not leave a server-side subscription behind when the device cannot
    // persist the user's explicit opt-in state.
    await deleteFcmToken(accessToken, csrfToken, token).catch(() => undefined);
    await saveAndroidPushState(false).catch(() => undefined);
    throw new Error('تم تسجيل الجهاز لكن تعذر حفظ اختيار الإشعارات محليًا. حاول مرة أخرى.');
  }
}

export async function unregisterAndroidFcmToken(
  accessToken: string,
  csrfToken?: string | null,
): Promise<void> {
  if (Platform.OS !== 'android' || !(await isAndroidPushEnabled())) return;
  const storedToken = await getRegisteredAndroidFcmToken();
  const token = storedToken || await getAndroidFcmToken();
  await deleteFcmToken(accessToken, csrfToken, token);
  await saveAndroidPushState(false);
}

export async function syncGrantedAndroidPush(
  accessToken: string,
  csrfToken?: string | null,
): Promise<void> {
  if (Platform.OS !== 'android' || !(await isAndroidPushEnabled())) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await registerAndroidFcmToken(accessToken, csrfToken);
}
