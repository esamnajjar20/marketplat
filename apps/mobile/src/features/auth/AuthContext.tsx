import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { ApiError } from '@/api/client';
import { loginWithPassword, logoutSession, refreshAccessSession, type AuthUser } from './auth.api';

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
  login: (email: string, password: string) => Promise<void>;
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

  const persist = useCallback(async (session: PersistedSession) => {
    await SecureStore.setItemAsync(SECURE_SESSION_KEY, JSON.stringify(session));
    setUser(session.user);
    setAccessToken(session.accessToken);
    setCsrfToken(session.csrfToken);
  }, []);

  const clearPersisted = useCallback(async () => {
    setUser(null);
    setAccessToken(null);
    setCsrfToken(null);
    await SecureStore.deleteItemAsync(SECURE_SESSION_KEY).catch(() => undefined);
  }, []);

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
    } finally {
      setIsBusy(false);
    }
  }, [persist]);

  const logout = useCallback(async () => {
    const token = accessToken;
    const csrf = csrfToken;
    setIsBusy(true);
    try {
      if (token) await logoutSession(token, csrf ?? undefined);
    } finally {
      // Local credentials are removed even when the server cannot be reached.
      await clearPersisted();
      setIsBusy(false);
    }
  }, [accessToken, csrfToken, clearPersisted]);

  const value = useMemo(() => ({ user, accessToken, csrfToken, isBusy, isRestoring, login, logout }), [user, accessToken, csrfToken, isBusy, isRestoring, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
