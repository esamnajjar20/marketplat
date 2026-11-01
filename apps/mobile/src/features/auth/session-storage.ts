/**
 * تخزين جلسة المصادقة في SecureStore — منفصل عن AuthContext.
 */
import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from './auth.api';

export const SECURE_SESSION_KEY = 'marketplat.mobile.session.v1';
export const PENDING_LOGOUT_KEY = 'marketplat.mobile.pending-logout.v1';
export const ACCESS_TOKEN_FALLBACK_TTL_SECONDS = 15 * 60;

export type PersistedSession = {
  user: AuthUser;
  accessToken: string;
  csrfToken: string | null;
  expiresAt: number;
};

export function sessionExpiry(expiresIn?: number): number {
  const seconds =
    Number.isFinite(expiresIn) && (expiresIn ?? 0) > 0
      ? Math.floor(expiresIn as number)
      : ACCESS_TOKEN_FALLBACK_TTL_SECONDS;
  return Date.now() + seconds * 1000;
}

export function isPersistedSession(value: unknown): value is PersistedSession {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PersistedSession>;
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.expiresAt === 'number' &&
    typeof candidate.csrfToken !== 'undefined' &&
    !!candidate.user &&
    typeof candidate.user.id === 'string' &&
    typeof candidate.user.email === 'string' &&
    typeof candidate.user.name === 'string'
  );
}

export async function readPersistedSession(): Promise<PersistedSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isPersistedSession(parsed)) return parsed;
    await SecureStore.deleteItemAsync(SECURE_SESSION_KEY).catch(() => undefined);
    return null;
  } catch {
    return null;
  }
}

export async function writePersistedSession(session: PersistedSession): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(SECURE_SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    // The in-memory session may still be usable, but callers must not claim it survives restart.
    return false;
  }
}

export async function clearPersistedSession(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(SECURE_SESSION_KEY);
    return true;
  } catch {
    // Logout callers need to know that the device did not confirm removal of the saved session.
    return false;
  }
}


export type PendingLogout = {
  accessToken: string;
  csrfToken: string | null;
  createdAt: number;
  /** FCM token to unregister before the deferred session revocation completes. */
  fcmToken?: string | null;
};

export async function readPendingLogout(): Promise<PendingLogout | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_LOGOUT_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error('Invalid pending logout marker.');
    const candidate = value as Partial<PendingLogout>;
    if (typeof candidate.accessToken !== 'string' || !candidate.accessToken ||
        typeof candidate.createdAt !== 'number' ||
        !(candidate.csrfToken === null || typeof candidate.csrfToken === 'string') ||
        !(candidate.fcmToken === undefined || candidate.fcmToken === null || (typeof candidate.fcmToken === 'string' && candidate.fcmToken.length > 0 && candidate.fcmToken.length <= 500))) {
      throw new Error('Invalid pending logout marker.');
    }
    return candidate as PendingLogout;
  } catch {
    // Fail closed: callers must not restore a new session when marker state is unreadable.
    throw new Error('تعذرت قراءة حالة تسجيل الخروج المؤجل.');
  }
}

export async function writePendingLogout(value: PendingLogout): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(PENDING_LOGOUT_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function clearPendingLogout(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(PENDING_LOGOUT_KEY);
    return true;
  } catch {
    return false;
  }
}
