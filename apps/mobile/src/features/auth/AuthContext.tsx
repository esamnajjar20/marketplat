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
import { Alert, AppState } from 'react-native';
import { useOnlineResync } from '@/lib/useOnlineResync';
import { ApiError, setAuthFailureHandler, setRefreshHandler, setTokenUpdater } from '@/api/client';
import {
  loginWithPassword,
  loginWithGoogleMobile,
  refreshAccessSession,
  registerAccount,
  cancelRefreshing,
  type AuthUser,
} from './auth.api';
import { beginNativeGoogleOAuth } from './google-oauth.native';
import { getRegisteredAndroidFcmToken, unregisterAndroidFcmToken } from '@/features/notifications/native-push';
import { logger } from '@/lib/logger';
import { mergeGuestFavoritesIntoAccount } from '@/features/ads/favorites.store';
import { fetchMyProfile } from '@/features/account/account.api';
import { countPendingPrivateMobileOperations } from '@/storage/public-cache';
import {
  ACCESS_TOKEN_FALLBACK_TTL_SECONDS,
  clearPersistedSession,
  readPersistedSession,
  sessionExpiry,
  writePersistedSession,
  readPendingLogout,
  writePendingLogout,
  clearPendingLogout,
  type PersistedSession,
  type PendingLogout,
} from './session-storage';
import {
  cleanupOnLogout,
  ensurePrivateStorageClean,
  tryCleanupBeforeRestore,
} from './private-data-cleanup';
import { revokePendingLogout } from './pending-logout';
import { showToast } from '@/lib/toast';

export type LocalSignOutResult = {
  cleanupFailed: boolean;
  cleanupMarkerSaved: boolean;
  sessionRemoved: boolean;
};

export type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  csrfToken: string | null;
  isBusy: boolean;
  isRestoring: boolean;
  expiresAt: number | null;
  sessionNeedsRefresh: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<AuthUser>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    city?: string;
  }) => Promise<void>;
  logout: () => Promise<'done' | 'cancelled' | 'failed'>;
  forceLocalSignOut: (options?: { clearPrivateData?: boolean }) => Promise<LocalSignOutResult>;
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
  const pendingLogoutSync = useRef(false);

  const applySession = useCallback((session: PersistedSession) => {
    setUser(session.user);
    accessTokenRef.current = session.accessToken;
    csrfRef.current = session.csrfToken;
    setAccessToken(session.accessToken);
    setCsrfToken(session.csrfToken);
    setExpiresAt(session.expiresAt);
    setSessionNeedsRefresh(session.expiresAt <= Date.now());
  }, []);

  const warnSessionPersistence = useCallback(() => {
    if (persistenceWarningShown.current) return;
    persistenceWarningShown.current = true;
    showToast('تعذّر حفظ الجلسة على الجهاز', 'تعمل الجلسة الحالية في الذاكرة، لكن التخزين الآمن لم يؤكد حفظها. قد تحتاج إلى تسجيل الدخول مجددًا بعد إغلاق التطبيق.', 'error');
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
    csrfRef.current = null;
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

  const forceLocalSignOut = useCallback(async (options?: { clearPrivateData?: boolean }): Promise<LocalSignOutResult> => {
    setIsBusy(true);
    cancelRefreshing();
    try {
      // A refresh rejection is not user consent to discard queued offline work.
      // Preserve owner-scoped data by default; account deletion explicitly opts in.
      let cleanupFailed = false;
      let cleanupMarkerSaved = true;
      if (options?.clearPrivateData) {
        const ownerId = userRef.current?.id;
        if (ownerId) {
          ({ cleanupFailed, cleanupMarkerSaved } = await cleanupOnLogout(ownerId));
        } else {
          cleanupFailed = true;
          cleanupMarkerSaved = false;
        }
      }
      const sessionRemoved = await clearPersisted();
      if (cleanupFailed || !sessionRemoved) {
        showToast('تم إنهاء الجلسة مع تحذير', cleanupFailed
            ? cleanupMarkerSaved
              ? 'لم يكتمل حذف بيانات الحساب المحلية. حُفظ طلب التنظيف وسيُمنع تسجيل الدخول حتى ينجح.'
              : 'لم يكتمل حذف بيانات الحساب، كما تعذر حفظ طلب التنظيف في التخزين الآمن. لا تستخدم حسابًا آخر على هذا الجهاز قبل استعادة الحساب نفسه أو مسح بيانات التطبيق من إعدادات الجهاز.'
            : 'لم يؤكد التخزين الآمن حذف الجلسة المحفوظة. أعد فتح التطبيق وتحقق من حالة الدخول قبل مشاركة الجهاز.', 'success');
      }
      return { cleanupFailed, cleanupMarkerSaved, sessionRemoved };
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
        showToast('انتهت صلاحية الجلسة', 'لم يعد الخادم يقبل بيانات تجديد الجلسة. سجّل الدخول من جديد؛ ستبقى عملياتك ومسوداتك المشفرة محفوظة لهذا الحساب.', 'error');
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
          showToast('تعذّر حذف جلسة محفوظة', 'لم يؤكد التخزين الآمن حذف الجلسة. تحقّق من حالة تسجيل الخروج قبل مشاركة الجهاز.', 'error');
        }
        if (mounted) setIsRestoring(false);
        return;
      }

      // A previous offline logout must be confirmed before refresh-cookie restoration.
      // Keep the revocation token only in SecureStore and fail closed if its marker cannot be read.
      let pendingLogout: PendingLogout | null;
      try {
        pendingLogout = await readPendingLogout();
      } catch {
        if (mounted) {
          setUser(null);
          setAccessToken(null);
          setIsRestoring(false);
          showToast('تسجيل الخروج قيد التأكيد', 'تعذرت قراءة حالة إبطال الجلسة السابقة. لن نستعيد جلسة أخرى قبل معالجة التخزين الآمن.', 'error');
        }
        return;
      }
      if (pendingLogout) {
        try {
          const outcome = await revokePendingLogout(pendingLogout);
          const markerRemoved = await clearPendingLogout();
          if (!markerRemoved) throw new Error('تعذر حذف علامة تسجيل الخروج المؤجل.');
          if (outcome === 'already-expired') {
            // The refresh cookie was rejected by the server, so this previous
            // logout is complete. Do not restore its cached access token.
            const removed = await clearPersisted();
            if (mounted && !removed) {
              showToast('تعذّر حذف جلسة محفوظة', 'لم يؤكد التخزين الآمن حذف الجلسة القديمة. تحقق من حالة تسجيل الدخول قبل مشاركة الجهاز.', 'error');
            }
            if (mounted) setIsRestoring(false);
            return;
          }
        } catch {
          if (mounted) {
            setUser(null);
            setAccessToken(null);
            setIsRestoring(false);
            showToast('تسجيل الخروج قيد التأكيد', 'تعذر تأكيد إبطال الجلسة السابقة. سيحتفظ التطبيق بطلب الإبطال ويحاول مجددًا عند عودة الاتصال، ولن يستعيد جلسة أو يسمح بدخول حساب آخر قبل حسمه.', 'error');
          }
          return;
        }
      }

      let cached = await readPersistedSession();

      if (cached && mounted) {
        applySession(cached);
      }

      try {
        const refreshed = await refreshAccessSession();
        if (mounted && cached) {
          let restoredUser = cached.user;
          // A user may verify their email from an external browser while the app is closed.
          // Re-check only cached unverified users; failure is non-fatal and keeps offline sign-in.
          if (cached.user.emailVerified === false) {
            try {
              const profile = await fetchMyProfile(refreshed.accessToken, cached.user.id);
              if (typeof profile.emailVerified === 'boolean') {
                restoredUser = { ...cached.user, emailVerified: profile.emailVerified };
              }
            } catch {
              // Preserve the cached state when the profile endpoint is unavailable.
            }
          }
          await persist({
            user: restoredUser,
            accessToken: refreshed.accessToken,
            csrfToken: refreshed.csrfToken ?? cached.csrfToken,
            expiresAt: sessionExpiry(refreshed.expiresIn),
          });
        } else if (mounted) {
          const removed = await clearPersisted();
          if (!removed) {
            showToast('تعذّر حذف جلسة محفوظة', 'لم يؤكد التخزين الآمن حذف الجلسة القديمة. تحقّق من حالة تسجيل الخروج قبل مشاركة الجهاز.', 'error');
          }
        }
      } catch (error) {
        // The refresh endpoint contract uses 401 for an invalid session.
        // Keep cached identity on other statuses (including unexpected 403s).
        const unauthorized = error instanceof ApiError && error.status === 401;
        if (mounted && unauthorized) {
          // Session expiry is not consent to discard drafts or unsynced writes.
          // They remain encrypted and owner-scoped for the next login by the same account.
          const removed = await clearPersisted();
          if (mounted && !removed) {
            showToast('تعذّر حذف جلسة محفوظة', 'لم يؤكد التخزين الآمن حذف الجلسة غير الصالحة. أعد فتح التطبيق وتأكد من حالة تسجيل الدخول قبل مشاركة الجهاز.', 'error');
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

  // Timers may be suspended while the app is backgrounded. Re-check the session
  // when returning to the foreground if the access token is expired or near expiry.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (isBusy) return;
      const activeUser = userRef.current;
      if (!activeUser || !expiresAt || (!sessionNeedsRefresh && expiresAt - Date.now() > 60_000)) return;
      void (async () => {
        try {
          const refreshed = await refreshAccessSession();
          if (userRef.current?.id !== activeUser.id) return;
          await persist({
            user: activeUser,
            accessToken: refreshed.accessToken,
            csrfToken: refreshed.csrfToken ?? csrfRef.current,
            expiresAt: sessionExpiry(refreshed.expiresIn),
          });
        } catch (error) {
          if (userRef.current?.id !== activeUser.id) return;
          if (error instanceof ApiError && error.status === 401) {
            handleInvalidRefresh();
          } else {
            setSessionNeedsRefresh(true);
          }
        }
      })();
    });
    return () => subscription.remove();
  }, [expiresAt, sessionNeedsRefresh, isBusy, persist, handleInvalidRefresh]);

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
        if (error instanceof ApiError && error.status === 401) {
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
      if (newCsrf !== undefined) {
        csrfRef.current = newCsrf;
        setCsrfToken(newCsrf);
      }
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

  const retryPendingLogout = useCallback(async (): Promise<boolean> => {
    if (pendingLogoutSync.current) return false;
    pendingLogoutSync.current = true;
    try {
      const pending = await readPendingLogout();
      if (!pending) return true;
      await revokePendingLogout(pending);
      return await clearPendingLogout();
    } catch {
      return false;
    } finally {
      pendingLogoutSync.current = false;
    }
  }, []);

  useOnlineResync(() => { void retryPendingLogout(); });

  const ensureNoPendingLogout = useCallback(async () => {
    const pending = await readPendingLogout();
    if (!pending) return;
    if (!(await retryPendingLogout())) {
      throw new Error('يجب الاتصال بالإنترنت لتأكيد تسجيل الخروج السابق قبل الدخول بحساب آخر.');
    }
  }, [retryPendingLogout]);

  const login = useCallback(
    async (email: string, password: string) => {
      await ensureNoPendingLogout();
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
    [persist, ensureNoPendingLogout],
  );

  const loginWithGoogle = useCallback(async () => {
    await ensureNoPendingLogout();
    await ensurePrivateStorageClean();
    setIsBusy(true);
    try {
      const handoff = await beginNativeGoogleOAuth();
      const session = await loginWithGoogleMobile(handoff.ticket, handoff.verifier);
      await persist({
        user: session.user,
        accessToken: session.accessToken,
        csrfToken: session.csrfToken ?? null,
        expiresAt: sessionExpiry(session.expiresIn),
      });
      await mergeGuestFavoritesIntoAccount(session.user.id).catch(() => undefined);
      return session.user;
    } finally {
      setIsBusy(false);
    }
  }, [persist, ensureNoPendingLogout]);

  const register = useCallback(
    async (input: {
      name: string;
      email: string;
      password: string;
      phone?: string;
      city?: string;
    }) => {
      await ensureNoPendingLogout();
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
    [persist, ensureNoPendingLogout],
  );

  const logout = useCallback(async (): Promise<'done' | 'cancelled' | 'failed'> => {
    const ownerId = user?.id ?? userRef.current?.id ?? '';
    let pendingOperations: number | null = ownerId ? 0 : null;
    try {
      pendingOperations = ownerId ? await countPendingPrivateMobileOperations(ownerId) : null;
    } catch {
      // We still require explicit consent, but never pretend the queue is empty
      // when the encrypted database could not be inspected.
      pendingOperations = null;
    }

    const queueDescription = pendingOperations === null
      ? 'تعذر فحص عدد العمليات المعلقة في التخزين المشفر.'
      : pendingOperations > 0
        ? `لديك ${pendingOperations} عملية بانتظار المزامنة.`
        : 'لم يُعثر على عمليات معلقة في الطابور الذي تم فحصه.';
    const logoutChoice = await new Promise<'keep' | 'delete' | 'cancel'>((resolve) => {
      Alert.alert(
        'تسجيل الخروج',
        `${queueDescription} الخيار الافتراضي يحتفظ بالمسودات والعمليات والرسائل والبيانات المشفرة لهذا الحساب على الجهاز؛ ويمكن استعادتها عند دخول الحساب نفسه. خيار الحذف يمسح بيانات هذا الحساب المحلية نهائيًا ولا يمكن استعادة العمليات غير المتزامنة.`,
        [
          { text: 'إلغاء', style: 'cancel', onPress: () => resolve('cancel') },
          { text: 'خروج مع الاحتفاظ بالبيانات', onPress: () => resolve('keep') },
          { text: 'خروج وحذف البيانات', style: 'destructive', onPress: () => resolve('delete') },
        ],
        { cancelable: true, onDismiss: () => resolve('cancel') },
      );
    });
    if (logoutChoice === 'cancel') return 'cancelled';
    const deletePrivateData = logoutChoice === 'delete';
    if (deletePrivateData && !ownerId) {
      showToast('تعذر حذف البيانات', 'تعذر تحديد مالك البيانات المحلية؛ لذلك لم تُحذف أي بيانات. أعد تسجيل الدخول إلى الحساب الأصلي قبل محاولة الحذف.', 'error');
      return 'failed';
    }

    const token = accessTokenRef.current;
    const csrf = csrfRef.current;
    setIsBusy(true);
    cancelRefreshing();
    if (!token && ownerId) {
      setIsBusy(false);
      showToast('تعذر تأكيد تسجيل الخروج', 'الحساب الحالي لا يملك رمز وصول صالحًا لحفظ طلب إبطال مؤجل. لم تُحذف بياناتك المحلية ولم يُعلن خروج الخادم. أعد فتح التطبيق وحاول بعد استعادة الجلسة أو اتصل بالإنترنت لتجديدها.', 'error');
      return 'failed';
    }
    let revocationConfirmed = !token && !userRef.current;
    let revocationMarkerSaved = false;
    let pendingFcmToken: string | null = null;
    if (token) {
      // Persist the write-ahead marker BEFORE beginning any destructive local cleanup.
      // If SecureStore cannot commit it, keep the current local session and its data intact.
      pendingFcmToken = await getRegisteredAndroidFcmToken();
      revocationMarkerSaved = await writePendingLogout({ accessToken: token, csrfToken: csrf, createdAt: Date.now(), fcmToken: pendingFcmToken });
      if (!revocationMarkerSaved) {
        setIsBusy(false);
        showToast('تعذر حفظ طلب تسجيل الخروج', 'لم يتم إرسال طلب الإبطال إلى الخادم ولم تُحذف بياناتك المحلية، لأن التخزين الآمن لم يحفظ علامة إعادة المحاولة. أعد المحاولة بعد عودة التخزين الآمن.', 'error');
        return 'failed';
      }
    }

    try {
      if (token) {
        // Stop native FCM delivery before the session is revoked. The token
        // is already in the write-ahead marker, so an offline failure is retried
        // before any later session can be restored or another account can log in.
        await unregisterAndroidFcmToken(token, csrf).catch((error) => {
          logger.warn('native-push', 'FCM token could not be removed during sign-out', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        const outcome = await revokePendingLogout({
          accessToken: token,
          csrfToken: csrf,
          createdAt: Date.now(),
          fcmToken: pendingFcmToken,
        });
        // A rejected refresh cookie is terminal: the server clears it, so this
        // deferred logout is complete even though the original access token expired.
        revocationConfirmed = outcome === 'revoked' || outcome === 'already-expired';
        if (!(await clearPendingLogout())) {
          revocationConfirmed = false;
        } else {
          revocationMarkerSaved = false;
        }
      }
    } catch {
      // Keep the persisted marker; it will be retried before any later login/restore.
    } finally {
      const { cleanupFailed, cleanupMarkerSaved } = deletePrivateData
        ? await cleanupOnLogout(ownerId)
        : { cleanupFailed: false, cleanupMarkerSaved: true };
      const sessionRemoved = await clearPersisted();
      setIsBusy(false);
      if (cleanupFailed || !sessionRemoved || !revocationConfirmed) {
        const warnings = [
          !revocationConfirmed
            ? (revocationMarkerSaved ? 'تعذر إبطال جلسة الخادم أثناء انقطاع الاتصال. حُفظ طلب إبطال مؤجل وسيُعاد قبل استعادة الجلسة أو تسجيل الدخول؛ لا تسجل الدخول بحساب آخر قبل تأكيده.' : 'لم يؤكد التطبيق إبطال جلسة الخادم أو حفظ طلب مؤجل. لا تسجل الدخول بحساب آخر قبل التحقق من انتهاء الجلسة السابقة.')
            : '', 
          cleanupFailed
            ? cleanupMarkerSaved
              ? 'لم يكتمل حذف بيانات الحساب الخاصة. حُفظ طلب التنظيف وسيُمنع تسجيل الدخول حتى ينجح.'
              : 'لم يكتمل حذف بيانات الحساب وتعذر حفظ طلب التنظيف في التخزين الآمن. لا تدخل بحساب آخر على هذا الجهاز قبل استعادة الحساب نفسه أو مسح بيانات التطبيق من إعدادات الجهاز.'
            : '',
          !sessionRemoved
            ? 'لم يؤكد التخزين الآمن حذف جلسة الدخول المحفوظة. أعد فتح التطبيق وتأكد من أنك ما زلت مسجّل الخروج قبل مشاركة الجهاز.'
            : '',
        ].filter(Boolean);
        showToast('اكتمل الخروج مع تحذير', `${warnings.join('\n\n')} إذا استمرت المشكلة، امسح بيانات التطبيق من إعدادات الجهاز قبل استخدام حساب آخر.`, 'warning');
        return 'failed';
      }
      return 'done';
    }
  }, [clearPersisted, user?.id]);

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
      loginWithGoogle,
      register,
      logout,
      forceLocalSignOut,
      updateUser,
      getAccessToken,
    }),
    [user, accessToken, csrfToken, isBusy, isRestoring, expiresAt, sessionNeedsRefresh, login, loginWithGoogle, register, logout, forceLocalSignOut, updateUser, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
