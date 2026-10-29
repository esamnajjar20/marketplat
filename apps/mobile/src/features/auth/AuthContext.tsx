/**
 * مزوّد المصادقة — منطق الجلسة والتنظيف مفصولان إلى:
 * - session-storage.ts
 * - private-data-cleanup.ts
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { ApiError, setRefreshHandler, setTokenUpdater } from '@/api/client';
import {
  loginWithPassword,
  logoutSession,
  refreshAccessSession,
  registerAccount,
  cancelRefreshing,
  type AuthUser,
} from './auth.api';
import { mergeGuestFavoritesIntoAccount } from '@/features/ads/favorites.store';
import { countPendingPrivateMobileOperations } from '@/storage/public-cache';
import {
  ACCESS_TOKEN_FALLBACK_TTL_SECONDS,
  clearPersistedSession,
  readPersistedSession,
  sessionExpiry,
  writePersistedSession,
  type PersistedSession,
} from './session-storage';
import {
  cleanupOnLogout,
  ensurePrivateStorageClean,
  tryCleanupBeforeRestore,
} from './private-data-cleanup';

export type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  csrfToken: string | null;
  isBusy: boolean;
  isRestoring: boolean;
  expiresAt: number | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    city?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  const userRef = useRef<AuthUser | null>(null);
  const csrfRef = useRef<string | null>(null);

  const applySession = useCallback((session: PersistedSession) => {
    setUser(session.user);
    setAccessToken(session.accessToken);
    setCsrfToken(session.csrfToken);
    setExpiresAt(session.expiresAt);
  }, []);

  const persist = useCallback(
    async (session: PersistedSession) => {
      applySession(session);
      await writePersistedSession(session);
    },
    [applySession],
  );

  const clearPersisted = useCallback(async () => {
    setUser(null);
    setAccessToken(null);
    setCsrfToken(null);
    setExpiresAt(null);
    await clearPersistedSession();
  }, []);

  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    csrfRef.current = csrfToken;
  }, [csrfToken]);

  // استعادة الجلسة عند الإقلاع
  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      const { blocked } = await tryCleanupBeforeRestore();
      if (blocked) {
        await clearPersisted();
        if (mounted) setIsRestoring(false);
        return;
      }

      let cached = await readPersistedSession();

      if (cached && cached.expiresAt > Date.now() && mounted) {
        applySession(cached);
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
          await clearPersisted();
        }
      } catch (error) {
        const unauthorized =
          error instanceof ApiError && (error.status === 401 || error.status === 403);
        if (mounted && (!cached || cached.expiresAt <= Date.now() || unauthorized)) {
          await clearPersisted();
        }
      } finally {
        if (mounted) setIsRestoring(false);
      }
    };
    void restore();
    return () => {
      mounted = false;
    };
  }, [applySession, clearPersisted, persist]);

  // تجديد استباقي قبل انتهاء الصلاحية بـ 60 ثانية
  useEffect(() => {
    if (!expiresAt || expiresAt <= Date.now()) return;
    const delay = Math.max(0, expiresAt - Date.now() - 60_000);
    const userIdAtSchedule = user?.id;
    const timer = setTimeout(async () => {
      try {
        const refreshed = await refreshAccessSession();
        if (!userIdAtSchedule || !userRef.current || userRef.current.id !== userIdAtSchedule) return;
        await persist({
          user: userRef.current,
          accessToken: refreshed.accessToken,
          csrfToken: refreshed.csrfToken ?? csrfRef.current,
          expiresAt: sessionExpiry(refreshed.expiresIn),
        });
      } catch {
        // Silent — interceptor أو إعادة تسجيل الدخول
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [expiresAt, user, persist]);

  // ربط refresh مع طبقة الـ API
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
      const newExpiresAt =
        typeof newExpiresIn === 'number' && newExpiresIn > 0
          ? Date.now() + newExpiresIn * 1000
          : Date.now() + ACCESS_TOKEN_FALLBACK_TTL_SECONDS * 1000;
      setExpiresAt(newExpiresAt);
      if (userRef.current) {
        void writePersistedSession({
          user: userRef.current,
          accessToken: newToken,
          csrfToken: newCsrf ?? csrfRef.current,
          expiresAt: newExpiresAt,
        });
      }
    });
    return () => {
      setRefreshHandler(null);
      setTokenUpdater(null);
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      await ensurePrivateStorageClean();
      setIsBusy(true);
      try {
        const session = await loginWithPassword(email, password);
        await persist({
          user: session.user,
          accessToken: session.accessToken,
          csrfToken: session.csrfToken ?? null,
          expiresAt: sessionExpiry(session.expiresIn),
        });
        await mergeGuestFavoritesIntoAccount(session.user.id).catch(() => undefined);
      } finally {
        setIsBusy(false);
      }
    },
    [persist],
  );

  const register = useCallback(
    async (input: {
      name: string;
      email: string;
      password: string;
      phone?: string;
      city?: string;
    }) => {
      await ensurePrivateStorageClean();
      setIsBusy(true);
      try {
        const session = await registerAccount(input);
        await persist({
          user: session.user,
          accessToken: session.accessToken,
          csrfToken: session.csrfToken ?? null,
          expiresAt: sessionExpiry(session.expiresIn),
        });
        await mergeGuestFavoritesIntoAccount(session.user.id).catch(() => undefined);
      } finally {
        setIsBusy(false);
      }
    },
    [persist],
  );

  const logout = useCallback(async () => {
    let pendingOperations = 0;
    try {
      pendingOperations = await countPendingPrivateMobileOperations();
    } catch {
      Alert.alert(
        'تعذر التحقق من العمليات المحلية',
        'لم نتمكن من التأكد مما إذا كانت هناك عمليات بانتظار المزامنة. لم يتم تسجيل الخروج حتى لا تفقد بيانات محلية دون قصد.',
      );
      return;
    }
    if (pendingOperations > 0) {
      const shouldDiscard = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'عمليات بانتظار المزامنة',
          `يوجد ${pendingOperations} عملية محفوظة على هذا الجهاز ولم يؤكد الخادم استلامها. إذا تابعت تسجيل الخروج فسيتم حذفها من الجهاز ولن تُرسل لاحقًا. اتصل بالإنترنت وانتظر المزامنة، أو اختر المتابعة لحذفها صراحةً.`,
          [
            { text: 'العودة للمزامنة', style: 'cancel', onPress: () => resolve(false) },
            { text: 'حذف العمليات والخروج', style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      });
      if (!shouldDiscard) return;
    }

    const token = accessToken;
    const csrf = csrfToken;
    setIsBusy(true);
    cancelRefreshing();
    try {
      if (token) await logoutSession(token, csrf ?? undefined);
    } catch {
      // إبطال الجلسة على الخادم فشل — نُكمل المسح المحلي
    } finally {
      const { cleanupFailed } = await cleanupOnLogout();
      await clearPersisted();
      setIsBusy(false);
      if (cleanupFailed) {
        Alert.alert(
          'تعذر تنظيف التخزين المحلي',
          'تم إنهاء الجلسة المحلية، لكن لم يكتمل حذف بيانات الحساب. سيُمنع تسجيل الدخول التالي حتى ينجح التنظيف. إذا استمرت المشكلة، امسح بيانات التطبيق من إعدادات الجهاز قبل استخدام حساب آخر.',
        );
      }
    }
  }, [accessToken, csrfToken, clearPersisted]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      csrfToken,
      isBusy,
      isRestoring,
      expiresAt,
      login,
      register,
      logout,
    }),
    [user, accessToken, csrfToken, isBusy, isRestoring, expiresAt, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
