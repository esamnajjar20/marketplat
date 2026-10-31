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
import { ApiError, setAuthFailureHandler, setRefreshHandler, setTokenUpdater } from '@/api/client';
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
  sessionNeedsRefresh: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    city?: string;
  }) => Promise<void>;
  logout: () => Promise<'done' | 'cancelled' | 'failed'>;
  forceLocalSignOut: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
  /** Stable token accessor for callbacks that must not rerun on token rotation. */
  getAccessToken: () => string | null;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [sessionNeedsRefresh, setSessionNeedsRefresh] = useState(false);

  const userRef = useRef<AuthUser | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const csrfRef = useRef<string | null>(null);
  const persistenceWarningShown = useRef(false);
  const authFailureHandling = useRef(false);

  const applySession = useCallback((session: PersistedSession) => {
    setUser(session.user);
    accessTokenRef.current = session.accessToken;
    setAccessToken(session.accessToken);
    setCsrfToken(session.csrfToken);
    setExpiresAt(session.expiresAt);
    setSessionNeedsRefresh(session.expiresAt <= Date.now());
  }, []);

  const warnSessionPersistence = useCallback(() => {
    if (persistenceWarningShown.current) return;
    persistenceWarningShown.current = true;
    Alert.alert(
      'تعذّر حفظ الجلسة على الجهاز',
      'تعمل الجلسة الحالية في الذاكرة، لكن التخزين الآمن لم يؤكد حفظها. قد تحتاج إلى تسجيل الدخول مجددًا بعد إغلاق التطبيق.',
    );
  }, []);

  const persist = useCallback(
    async (session: PersistedSession): Promise<boolean> => {
      applySession(session);
      const saved = await writePersistedSession(session);
      if (!saved) warnSessionPersistence();
      return saved;
    },
    [applySession, warnSessionPersistence],
  );

  const clearPersisted = useCallback(async (): Promise<boolean> => {
    // Clear in-memory access first. SecureStore failures must remain observable to logout.
    setUser(null);
    accessTokenRef.current = null;
    setAccessToken(null);
    setCsrfToken(null);
    setExpiresAt(null);
    setSessionNeedsRefresh(false);
    return clearPersistedSession();
  }, []);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const updateUser = useCallback((patch: Partial<AuthUser>) => { setUser(current => current ? { ...current, ...patch } : current); }, []);
  const getAccessToken = useCallback(() => accessTokenRef.current, []);
  useEffect(() => {
    csrfRef.current = csrfToken;
  }, [csrfToken]);

  const forceLocalSignOut = useCallback(async (): Promise<void> => {
    setIsBusy(true);
    cancelRefreshing();
    try {
      const { cleanupFailed } = await cleanupOnLogout();
      const sessionRemoved = await clearPersisted();
      if (cleanupFailed || !sessionRemoved) {
        Alert.alert(
          'تم إنهاء الجلسة مع تحذير',
          'لم يكتمل تنظيف كل البيانات المحلية أو لم يؤكد التخزين الآمن حذف الجلسة. سيُمنع تسجيل الدخول بحساب آخر حتى ينجح التنظيف. امسح بيانات التطبيق من إعدادات الجهاز إذا استمرت المشكلة.',
        );
      }
    } finally {
      setIsBusy(false);
    }
  }, [clearPersisted]);

  const handleInvalidRefresh = useCallback(() => {
    if (authFailureHandling.current) return;
    authFailureHandling.current = true;
    void forceLocalSignOut()
      .finally(() => {
        authFailureHandling.current = false;
        Alert.alert('انتهت صلاحية الجلسة', 'لم يعد الخادم يقبل بيانات تجديد الجلسة. سجّل الدخول من جديد للمتابعة.');
      });
  }, [forceLocalSignOut]);


  // استعادة الجلسة عند الإقلاع
  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      const { blocked } = await tryCleanupBeforeRestore();
      if (blocked) {
        const removed = await clearPersisted();
        if (mounted && !removed) {
          Alert.alert('تعذّر حذف جلسة محفوظة', 'لم يؤكد التخزين الآمن حذف الجلسة. تحقّق من حالة تسجيل الخروج قبل مشاركة الجهاز.');
        }
        if (mounted) setIsRestoring(false);
        return;
      }

      let cached = await readPersistedSession();

      if (cached && mounted) {
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
          const removed = await clearPersisted();
          if (!removed) {
            Alert.alert('تعذّر حذف جلسة محفوظة', 'لم يؤكد التخزين الآمن حذف الجلسة القديمة. تحقّق من حالة تسجيل الخروج قبل مشاركة الجهاز.');
          }
        }
      } catch (error) {
        const unauthorized =
          error instanceof ApiError && (error.status === 401 || error.status === 403);
        if (mounted && unauthorized) {
          const { cleanupFailed } = await cleanupOnLogout();
          const removed = await clearPersisted();
          if (mounted && cleanupFailed) {
            Alert.alert('تنبيه أمني', 'انتهت صلاحية الجلسة، لكن تعذّر تنظيف بعض بيانات الحساب المحلية. سيُمنع تسجيل الدخول بحساب آخر حتى ينجح التنظيف.');
          }
          if (mounted && !removed) {
            Alert.alert(
              'تعذّر حذف جلسة محفوظة',
              'لم يؤكد التخزين الآمن حذف الجلسة غير الصالحة. أعد فتح التطبيق وتأكد من حالة تسجيل الدخول قبل مشاركة الجهاز.',
            );
          }
        } else if (mounted && cached) {
          // Network/timeout/5xx: retain the local identity and cached read-only data.
          setSessionNeedsRefresh(true);
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
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          if (userRef.current?.id === userIdAtSchedule) void forceLocalSignOut();
        } else if (userRef.current?.id === userIdAtSchedule) {
          setSessionNeedsRefresh(true);
        }
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [expiresAt, user, persist, forceLocalSignOut]);

  // ربط refresh مع طبقة الـ API
  useEffect(() => {
    setAuthFailureHandler(() => handleInvalidRefresh());
    setRefreshHandler(async () => {
      const refreshed = await refreshAccessSession();
      return {
        accessToken: refreshed.accessToken,
        csrfToken: refreshed.csrfToken,
        expiresIn: refreshed.expiresIn,
      };
    });
    setTokenUpdater((newToken, newCsrf, newExpiresIn) => {
      accessTokenRef.current = newToken;
      setAccessToken(newToken);
      if (newCsrf !== undefined) setCsrfToken(newCsrf);
      const newExpiresAt =
        typeof newExpiresIn === 'number' && newExpiresIn > 0
          ? Date.now() + newExpiresIn * 1000
          : Date.now() + ACCESS_TOKEN_FALLBACK_TTL_SECONDS * 1000;
      setExpiresAt(newExpiresAt);
      setSessionNeedsRefresh(false);
      if (userRef.current) {
        void writePersistedSession({
          user: userRef.current,
          accessToken: newToken,
          csrfToken: newCsrf ?? csrfRef.current,
          expiresAt: newExpiresAt,
        }).then((saved) => {
          if (!saved) warnSessionPersistence();
        });
      }
    });
    return () => {
      setRefreshHandler(null);
      setTokenUpdater(null);
      setAuthFailureHandler(null);
    };
  }, [handleInvalidRefresh, warnSessionPersistence]);

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

  const logout = useCallback(async (): Promise<'done' | 'cancelled' | 'failed'> => {
    let pendingOperations = 0;
    try {
      pendingOperations = await countPendingPrivateMobileOperations();
    } catch {
      const mayProceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'تعذر فحص البيانات المحلية',
          'تعذر فتح قاعدة البيانات أو عدّ العمليات المعلقة. يمكنك إلغاء العملية أو إنهاء الجلسة الآن؛ سيُحاول التطبيق تنظيف البيانات عند الفتح التالي، وقد تحتاج إلى إعادة ضبط التخزين المحلي إذا كان تالفًا.',
          [
            { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
            { text: 'إنهاء الجلسة', style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      });
      if (!mayProceed) return 'cancelled';
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
      if (!shouldDiscard) return 'cancelled';
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
      const sessionRemoved = await clearPersisted();
      setIsBusy(false);
      if (cleanupFailed || !sessionRemoved) {
        const warnings = [
          cleanupFailed
            ? 'لم يكتمل حذف بيانات الحساب الخاصة. سيُمنع تسجيل الدخول التالي حتى ينجح التنظيف.'
            : '',
          !sessionRemoved
            ? 'لم يؤكد التخزين الآمن حذف جلسة الدخول المحفوظة. أعد فتح التطبيق وتأكد من أنك ما زلت مسجّل الخروج قبل مشاركة الجهاز.'
            : '',
        ].filter(Boolean);
        Alert.alert('اكتمل الخروج مع تحذير', `${warnings.join('\n\n')} إذا استمرت المشكلة، امسح بيانات التطبيق من إعدادات الجهاز قبل استخدام حساب آخر.`);
        return 'failed';
      }
      return 'done';
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
      sessionNeedsRefresh,
      login,
      register,
      logout,
      forceLocalSignOut,
      updateUser,
      getAccessToken,
    }),
    [user, accessToken, csrfToken, isBusy, isRestoring, expiresAt, sessionNeedsRefresh, login, register, logout, forceLocalSignOut, updateUser, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
