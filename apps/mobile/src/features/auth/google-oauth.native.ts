import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { apiRequest, getApiBaseUrl } from '@/api/client';

const REDIRECT_URI = 'marketplat://oauth/callback';

export type NativeGoogleOAuthHandoff = { ticket: string; verifier: string };

WebBrowser.maybeCompleteAuthSession();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Uses the system browser for Google consent and an API-owned one-time
 * PKCE exchange. No access/refresh token is ever placed in the deep link.
 */
export async function beginNativeGoogleOAuth(): Promise<NativeGoogleOAuthHandoff> {
  if (Platform.OS === 'web') throw new Error('تسجيل Google الأصلي متاح في تطبيق الهاتف فقط.');

  const verifier = toHex(await Crypto.getRandomBytesAsync(32));
  const challengeBase64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  const challenge = toBase64Url(challengeBase64);
  const startUrl = new URL('/api/v1/auth/google', getApiBaseUrl());
  startUrl.searchParams.set('client', 'mobile');
  startUrl.searchParams.set('code_challenge', challenge);
  startUrl.searchParams.set('code_challenge_method', 'S256');

  const result = await WebBrowser.openAuthSessionAsync(startUrl.toString(), REDIRECT_URI);
  if (result.type !== 'success') {
    throw new Error(result.type === 'cancel' || result.type === 'dismiss'
      ? 'تم إلغاء تسجيل الدخول باستخدام Google.'
      : 'تعذر إكمال نافذة تسجيل الدخول باستخدام Google.');
  }

  let callback: URL;
  try {
    callback = new URL(result.url);
  } catch {
    throw new Error('رابط العودة من Google غير صالح.');
  }
  if (callback.protocol !== 'marketplat:' || callback.hostname !== 'oauth' || callback.pathname !== '/callback') {
    throw new Error('تم رفض رابط عودة غير متوقع من Google.');
  }
  const callbackError = callback.searchParams.get('error');
  if (callbackError) throw new Error('تعذر التحقق من حساب Google. حاول مرة أخرى أو استخدم تسجيل الدخول بالبريد.');

  const ticket = callback.searchParams.get('ticket') ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
    throw new Error('لم يستلم التطبيق تذكرة تسجيل دخول صالحة من الخادم.');
  }
  return { ticket, verifier };
}

/**
 * Re-authenticate the linked Google identity for an irreversible native account
 * deletion. The API binds the short-lived OAuth flow to the current Access
 * Token's session; the PKCE ticket only reports the already-completed action.
 */
export async function beginNativeGoogleDeletion(
  accessToken: string,
  csrfToken?: string | null,
): Promise<void> {
  if (Platform.OS === 'web') throw new Error('استخدم تأكيد Google من إعدادات الحساب على الويب.');
  if (!accessToken) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجدداً.');

  const verifier = toHex(await Crypto.getRandomBytesAsync(32));
  const challengeBase64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  const challenge = toBase64Url(challengeBase64);
  const startResponse = await apiRequest<{
    success?: boolean;
    data?: { flowId?: string };
    message?: string;
  }>('/api/v1/auth/mobile/google/delete/start', {
    method: 'POST',
    token: accessToken,
    credentials: 'include',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    body: JSON.stringify({ codeChallenge: challenge }),
  });
  const flowId = startResponse?.data?.flowId;
  if (startResponse?.success !== true || typeof flowId !== 'string' || !/^[a-f0-9]{64}$/.test(flowId)) {
    throw new Error(startResponse?.message || 'تعذر بدء إعادة تأكيد Google.');
  }

  const startUrl = new URL('/api/v1/auth/google', getApiBaseUrl());
  startUrl.searchParams.set('client', 'mobile');
  startUrl.searchParams.set('flow_id', flowId);
  const result = await WebBrowser.openAuthSessionAsync(startUrl.toString(), REDIRECT_URI);
  if (result.type !== 'success') {
    throw new Error(result.type === 'cancel' || result.type === 'dismiss'
      ? 'تم إلغاء تأكيد Google.'
      : 'تعذر إكمال إعادة تأكيد Google.');
  }

  let callback: URL;
  try {
    callback = new URL(result.url);
  } catch {
    throw new Error('رابط العودة من Google غير صالح.');
  }
  if (callback.protocol !== 'marketplat:' || callback.hostname !== 'oauth' || callback.pathname !== '/callback') {
    throw new Error('تم رفض رابط عودة غير متوقع من Google.');
  }
  if (callback.searchParams.get('action') !== 'deleted') {
    throw new Error('لم يكتمل حذف الحساب عبر Google.');
  }
  const ticket = callback.searchParams.get('ticket') ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
    throw new Error('لم يستلم التطبيق إيصال حذف صالحاً من الخادم.');
  }

  const exchange = await apiRequest<{
    success?: boolean;
    data?: { accountDeleted?: boolean };
    message?: string;
  }>('/api/v1/auth/mobile/google/delete/exchange', {
    method: 'POST',
    credentials: 'include',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    body: JSON.stringify({ ticket, verifier }),
  });
  if (exchange?.success !== true || exchange.data?.accountDeleted !== true) {
    throw new Error(exchange?.message || 'تعذر تأكيد نتيجة حذف الحساب.');
  }
}

