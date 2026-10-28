import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { ApiError, setRefreshHandler, setTokenUpdater } from '@/api/client';
import { loginWithPassword, logoutSession, refreshAccessSession, registerAccount, cancelRefreshing, type AuthUser } from './auth.api';
import { mergeGuestFavoritesIntoAccount } from '@/features/ads/favorites.store';

const SECURE_SESSION_KEY = 'marketplat.mobile.session.v1';
const ACCESS_TOKEN_FALLBACK_TTL_SECONDS = 15 * 60;

type PersistedSession = {
  user: AuthUser;
  accessToken: string;
  csrfToken: string | null;
  expiresAt: number;
};

export type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  csrfToken: string | null;
  isBusy: boolean;
  isRestoring: boolean;
  expiresAt: number | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; phone?: string; city?: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function sessionExpiry(expiresIn?: number): number {
  const seconds = Number.isFinite(expiresIn) && (expiresIn ?? 0) > 0
    ? Math.floor(expiresIn as number)
    : ACCESS_TOKEN_FALLBACK_TTL_SECONDS;
  return Date.now() + seconds * 1000;
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PersistedSession>;
  return typeof candidate.accessToken === 'string'
    && candidate.accessToken.length > 0
    && typeof candidate.expiresAt === 'number'
    && typeof candidate.csrfToken !== 'undefined'
    && !!candidate.user
    && typeof candidate.user.id === 'string'
    && typeof candidate.user.email === 'string'
    && typeof candidate.user.name === 'string';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  // Refs mirror latest state so the interceptor's tokenUpdater callback
  // can persist to SecureStore without stale closures.
  const userRef = useRef<AuthUser | null>(null);
  const csrfRef = useRef<string | null>(null);

  const persist = useCallback(async (session: PersistedSession) => {
    // Update in-memory state first: this run's session works even if SecureStore
    // is unavailable (device full, OS error). Next cold start won't restore it,
    // but the user is not left with a 'login failed' state while the server
    // already issued a session.
    setUser(session.user);
    setAccessToken(session.accessToken);
    setCsrfToken(session.csrfToken);
    setExpiresAt(session.expiresAt);
    try {
      await SecureStore.setItemAsync(SECURE_SESSION_KEY, JSON.stringify(session));
    } catch {
      // Persistence failed — session lives only in memory for this run.
    }
  }, []);

  const clearPersisted = useCallback(async () => {
    setUser(null);
    setAccessToken(null);
    setCsrfToken(null);
    setExpiresAt(null);
    await SecureStore.deleteItemAsync(SECURE_SESSION_KEY).catch(() => undefined);
  }, []);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { csrfRef.current = csrfToken; }, [csrfToken]);

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      let cached: PersistedSession | null = null;
      try {
        const raw = await SecureStore.getItemAsync(SECURE_SESSION_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isPersistedSession(parsed)) cached = parsed;
          else await SecureStore.deleteItemAsync(SECURE_SESSION_KEY);
        }
      } catch {
        // A secure-storage or decoding failure must not crash the app or log secrets.
        cached = null;
      }

      if (cached && cached.expiresAt > Date.now() && mounted) {
        setUser(cached.user);
        setAccessToken(cached.accessToken);
        setCsrfToken(cached.csrfToken);
        setExpiresAt(cached.expiresAt);
      }

      try {
        const refreshed = await refreshAccessSession();
        if (mounted && cached) {
          await persist({
            user: cached.user,
            accessToken: refreshed.accessToken,
            csrfToken: refreshed.csrfToken ?? cached.csrfToken,
            expiresAt: sessionExpiry(refreshed.expiresIn),
          });
        } else if (mounted) {
          // No saved user profile is available; a refresh response intentionally contains tokens only.
          // Do not manufacture user identity from a token. Ask the user to sign in again.
          await clearPersisted();
        }
      } catch (error) {
        const unauthorized = error instanceof ApiError && (error.status === 401 || error.status === 403);
        if (mounted && (!cached || cached.expiresAt <= Date.now() || unauthorized)) {
          await clearPersisted();
        }
        // If refresh failed because the device is offline, retain a still-valid secure access token.
      } finally {
        if (mounted) setIsRestoring(false);
      }
    };
    void restore();
    return () => { mounted = false; };
  }, [clearPersisted, persist]);

  // Proactively refresh the access token 60s before expiry to avoid 401 storms.
  useEffect(() => {
    if (!expiresAt || expiresAt <= Date.now()) return;
    const delay = Math.max(0, expiresAt - Date.now() - 60_000);
    const userIdAtSchedule = user?.id;
    const timer = setTimeout(async () => {
      try {
        const refreshed = await refreshAccessSession();
        // Session may have changed (logout / switch account) during the await.
        // Writing the refreshed tokens under the wrong user corrupts both sessions.
        if (!userIdAtSchedule || !userRef.current || userRef.current.id !== userIdAtSchedule) return;
        await persist({
          user: userRef.current,
          accessToken: refreshed.accessToken,
          csrfToken: refreshed.csrfToken ?? csrfRef.current,
          expiresAt: sessionExpiry(refreshed.expiresIn),
        });
      } catch {
        // Silent — interceptor or manual re-login will handle it.
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [expiresAt, user, csrfToken, persist]);

  // Register transparent refresh handlers so apiRequest can retry on 401
  // without importing auth.api directly (avoids circular dependency).
  useEffect(() => {
    setRefreshHandler(async () => {
      const refreshed = await refreshAccessSession();
      return {
        accessToken: refreshed.accessToken,
        csrfToken: refreshed.csrfToken,
        expiresIn: refreshed.expiresIn,
      };
    });
    setTokenUpdater((newToken, newCsrf, newExpiresIn) => {
      setAccessToken(newToken);
      if (newCsrf !== undefined) setCsrfToken(newCsrf);
      // Always persist — if the server omitted expiresIn, fall back to the
      // session TTL so a restart never restores a stale rotated token.
      const newExpiresAt = typeof newExpiresIn === 'number' && newExpiresIn > 0
        ? Date.now() + newExpiresIn * 1000
        : Date.now() + ACCESS_TOKEN_FALLBACK_TTL_SECONDS * 1000;
      setExpiresAt(newExpiresAt);
      if (userRef.current) {
        void SecureStore.setItemAsync(SECURE_SESSION_KEY, JSON.stringify({
          user: userRef.current,
          accessToken: newToken,
          csrfToken: newCsrf ?? csrfRef.current,
          expiresAt: newExpiresAt,
        } satisfies PersistedSession)).catch(() => undefined);
      }
    });
    return () => {
      setRefreshHandler(null);
      setTokenUpdater(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsBusy(true);
    try {
      const session = await loginWithPassword(email, password);
      await persist({
        user: session.user,
        accessToken: session.accessToken,
        csrfToken: session.csrfToken ?? null,
        expiresAt: sessionExpiry(session.expiresIn),
      });
      // Merge any favorites the user starred while anonymous.
      // Failures are non-fatal — the sign-in itself already succeeded.
      await mergeGuestFavoritesIntoAccount(session.user.id).catch(() => undefined);
    } finally {
      setIsBusy(false);
    }
  }, [persist]);

  const register = useCallback(async (input: { name: string; email: string; password: string; phone?: string; city?: string }) => {
    setIsBusy(true);
    try {
      const session = await registerAccount(input);
      await persist({ user: session.user, accessToken: session.accessToken, csrfToken: session.csrfToken ?? null, expiresAt: sessionExpiry(session.expiresIn) });
      // New users may already have guest favorites from before sign-up.
      await mergeGuestFavoritesIntoAccount(session.user.id).catch(() => undefined);
    } finally { setIsBusy(false); }
  }, [persist]);

  const logout = useCallback(async () => {
    const token = accessToken;
    const csrf = csrfToken;
    setIsBusy(true);
    // Prevent an in-flight refresh from clobbering local state after logout.
    cancelRefreshing();
    try {
      if (token) await logoutSession(token, csrf ?? undefined);
    } catch {
      // Server-side session invalidation failed (offline, 5xx). Local credentials
      // are still removed in finally. Callers treat this as successful logout.
    } finally {
      await clearPersisted();
      setIsBusy(false);
    }
  }, [accessToken, csrfToken, clearPersisted]);

  const value = useMemo(() => ({ user, accessToken, csrfToken, isBusy, isRestoring, expiresAt, login, register, logout }), [user, accessToken, csrfToken, isBusy, isRestoring, expiresAt, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
