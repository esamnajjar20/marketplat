/**
 * تخزين جلسة المصادقة في SecureStore — منفصل عن AuthContext.
 */
import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from './auth.api';

export const SECURE_SESSION_KEY = 'marketplat.mobile.session.v1';
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

export async function writePersistedSession(session: PersistedSession): Promise<void> {
  try {
    await SecureStore.setItemAsync(SECURE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Persistence failed — caller keeps in-memory session for this run.
  }
}

export async function clearPersistedSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_SESSION_KEY).catch(() => undefined);
}
