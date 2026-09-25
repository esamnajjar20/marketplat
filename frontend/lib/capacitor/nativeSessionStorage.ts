/**
 * COOKIE-POLICY-01 / NATIVE-SESSION-01
 *
 * Persistent *non-secret* session metadata for Capacitor native shells.
 *
 * Why this exists:
 *  - refreshToken is httpOnly and invisible to JS (correct for XSS).
 *  - On native WebViews, cookie jars can be flaky across process death /
 *    OS memory pressure; a lightweight "we had a session for user X"
 *    flag lets AuthHydrationProvider decide offline-session UX without
 *    inventing a second secret store.
 *  - We never store accessToken or refreshToken here — only userId and
 *    a boolean hasSession hint.
 *
 * Storage backend:
 *  1. @capacitor/preferences when running inside a native shell and the
 *     plugin is installed (optional dependency — see package.json).
 *  2. localStorage fallback on web / when the plugin is missing.
 *

 * SECURE-STORAGE-01 (closed by design):
 *  We deliberately do NOT store accessToken or refreshToken here.
 *  Putting the refresh token in Preferences would re-open XSS/backup
 *  exposure that httpOnly cookies close. On Capacitor, the WebView
 *  cookie jar holds the httpOnly refreshToken; this module only stores
 *  non-secret UX hints (userId / hasSession) so offline chrome can paint
 *  while /auth/refresh settles. If a future platform loses httpOnly
 *  cookies entirely, prefer CapApp + server-side session binding over
 *  moving secrets into Preferences.
 *
 * Install on native builds:
 *   npm i @capacitor/preferences
 *   npx cap sync
 */

const STORAGE_KEY = 'marketplat:native-session';

export interface NativeSessionMeta {
  userId: string | null;
  hasSession: boolean;
  updatedAt: string;
}

const EMPTY: NativeSessionMeta = {
  userId: null,
  hasSession: false,
  updatedAt: '',
};

async function usePreferences(): Promise<boolean> {
  try {
    const { isNativePlatform } = await import('@/lib/capacitor/platform');
    if (!(await isNativePlatform())) return false;
    await import('@capacitor/preferences');
    return true;
  } catch {
    return false;
  }
}

async function prefsGet(key: string): Promise<string | null> {
  const { Preferences } = await import('@capacitor/preferences');
  const { value } = await Preferences.get({ key });
  return value ?? null;
}

async function prefsSet(key: string, value: string): Promise<void> {
  const { Preferences } = await import('@capacitor/preferences');
  await Preferences.set({ key, value });
}

async function prefsRemove(key: string): Promise<void> {
  const { Preferences } = await import('@capacitor/preferences');
  await Preferences.remove({ key });
}

function localGet(): NativeSessionMeta {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as NativeSessionMeta;
    return {
      userId: parsed.userId ?? null,
      hasSession: Boolean(parsed.hasSession),
      updatedAt: parsed.updatedAt ?? '',
    };
  } catch {
    return { ...EMPTY };
  }
}

function localSet(meta: NativeSessionMeta): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    /* quota / private mode */
  }
}

function localRemove(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Read session meta (native Preferences → localStorage). */
export async function getNativeSessionMeta(): Promise<NativeSessionMeta> {
  if (await usePreferences()) {
    try {
      const raw = await prefsGet(STORAGE_KEY);
      if (!raw) return { ...EMPTY };
      const parsed = JSON.parse(raw) as NativeSessionMeta;
      return {
        userId: parsed.userId ?? null,
        hasSession: Boolean(parsed.hasSession),
        updatedAt: parsed.updatedAt ?? '',
      };
    } catch {
      return localGet();
    }
  }
  return localGet();
}

/**
 * Mark that a real session exists for this user.
 * Call after successful login / refresh / setAuth.
 */
export async function setNativeSessionMeta(
  userId: string | null,
): Promise<void> {
  const meta: NativeSessionMeta = {
    userId,
    hasSession: Boolean(userId),
    updatedAt: new Date().toISOString(),
  };
  if (await usePreferences()) {
    try {
      await prefsSet(STORAGE_KEY, JSON.stringify(meta));
      // Mirror to localStorage so web-path code that only reads sync
      // localStorage still sees the same hint after a native↔web handoff.
      localSet(meta);
      return;
    } catch {
      /* fall through */
    }
  }
  localSet(meta);
}

/** Clear on logout / password change / account deletion. */
export async function clearNativeSessionMeta(): Promise<void> {
  if (await usePreferences()) {
    try {
      await prefsRemove(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  localRemove();
}
