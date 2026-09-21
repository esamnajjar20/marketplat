/**
 * Mutation hooks for authentication actions.
 *
 * FIX T-01: useLogin/useRegister use LoginResponseData correctly.
 *           After login, setAuth() populates minimal user (id/name/email/role).
 *           A background /users/me call enriches avatarUrl/city.
 *
 * FIX AUTH-03 + C-04: Login sets middleware cookies (app_access_token, app_user_role).
 *                      Cookie helpers extracted to @/lib/cookies to remove duplication
 *                      with AuthHydrationProvider.
 */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { authApi }       from '@/api/auth.api';
import { usersApi }      from '@/api/users.api';
import { queryKeys }     from '@/lib/queryKeys';
import { ROUTES }        from '@/lib/constants';
import { track }         from '@/lib/analytics';
import { clearSensitiveLocalData, clearServiceWorkerApiCache } from '@/lib/authCleanup';
import { warmSelfDataForOffline } from '@/lib/offlineSelfWarm';
import { clearNotificationsCache } from '@/lib/notificationsCache';
import { useAuthStore, selectSetAuth, selectSetUser, selectLogout } from '@/store/auth.store';
import { resumeSession } from '@/api/client';
import { setCookie, deleteCookie, cookieMaxAgeFromExpiresIn, SESSION_HINT_COOKIE_MAX_AGE } from '@/lib/cookies';
import { parseApiError } from '@/lib/errorParser';
import { unwrapData }    from '@/lib/apiPagination';
import { toast }         from 'sonner';
import type { AuthResultUser, AuthTokens, LoginPayload, RegisterPayload } from '@/types/auth.types';

/**
 * Sets the cookies the middleware reads for route protection. Used by
 * both login and register.
 *
 * AUDIT-FIX C-1: also sets app_has_session (client-side mirror of the
 * same-named cookie the backend already sets via Set-Cookie on this
 * same response — see authCookies.ts). Setting it here too means
 * middleware sees it immediately on this very response's redirect,
 * without waiting on any cookie propagation timing; its real 7-day
 * lifetime lives server-side regardless.
 */
function setAuthCookies(user: AuthResultUser, tokens: AuthTokens) {
  // FIX REFRESH-QUEUE-LOGOUT: a new session just started — clear the
  // sessionRevoked flag that invalidateRefreshSession() set when the
  // previous session ended. Called exactly once per login/register
  // (this helper is only invoked from those two paths), so it's the
  // natural reset point.
  resumeSession();
  // FIX BUG-06: derives maxAge from the backend's own tokens.expiresIn
  // instead of the old fixed AUTH_COOKIE_MAX_AGE constant.
  const maxAge = cookieMaxAgeFromExpiresIn(tokens.expiresIn);
  setCookie('app_access_token', tokens.accessToken, maxAge);
  setCookie('app_user_role',    user.role,          maxAge);
  setCookie('app_has_session',  '1',                SESSION_HINT_COOKIE_MAX_AGE);
}

/**
 * Clears the auth cookies. Used by logout, logout-all, and
 * useDeleteAccount (useUpdateProfile.ts) — exported (was module-private)
 * so account deletion doesn't need to hand-duplicate the same
 * deleteCookie calls with the cookie names spelled out again.
 */
export function clearAuthCookies() {
  deleteCookie('app_access_token');
  deleteCookie('app_user_role');
  deleteCookie('app_has_session'); // AUDIT-FIX C-1
}

/**
 * SECURITY FIX: sw.js's networkFirst() caches API GET responses keyed
 * only by URL — with no per-user scoping. Nothing previously told the
 * service worker to drop that cache on logout, so on a shared device
 * the next signed-in user could be served a prior user's cached API
 * responses (profile, seller data, service requests...) on the very
 * next network hiccup. Exported (like clearAuthCookies above) so
 * useDeleteAccount can call it too — an account deletion is at least
 * as sensitive as a logout.
 */
// إعادة تصدير لتوافق الاستيرادات القديمة (components/admin/AdminHeader.tsx,
// hooks/mutations/useUpdateProfile.ts) — التعريف الفعلي الآن بـ
// lib/authCleanup.ts (FIX AUTH-CLEANUP-CENTRALIZE-01).
export { clearServiceWorkerApiCache };

export function useLogin() {
  // PERF-05 FIX: targeted selectors instead of full store subscription.
  const setAuth   = useAuthStore(selectSetAuth);
  const setUser   = useAuthStore(selectSetUser);
  const router               = useRouter();
  const queryClient          = useQueryClient();

  return useMutation({
    mutationFn: ({ redirectTo, ...payload }: LoginPayload & { redirectTo?: string }) =>
      authApi.login(payload).then((r) => ({ ...unwrapData(r), redirectTo })),

    onSuccess: async (data) => {
      // FIX SHARED-DEVICE-LOGIN-LEAK-01: مسح دفاعي قبل أي شيء آخر — لا
      // نفترض أن الجلسة السابقة على هذا الجهاز انتهت بـlogout نظيف
      // (تطبيق أُغلق قسرًا/تعطّل). API_CACHE بالـSW (Cache Storage) و
      // notificationsCache (localStorage) يعيشان عبر إعادة تشغيل
      // التطبيق، وغير مرتبطين بهوية مستخدم بمفتاح الكاش — لو انقطع
      // النت لحظيًا بعد هذا الدخول (سيناريو شائع بهذا التطبيق)،
      // networkFirstApi's fallback (sw.js) قد يرجّع ردود API مخزَّنة
      // تخص مستخدم سابق على نفس الجهاز. عمدًا لا نستخدم
      // clearSensitiveLocalData() الكاملة هنا — تمسح أيضًا طابور
      // العمليات المعلّقة وتُلغي اشتراك push، وهذان صحيحان عند *إنهاء*
      // جلسة (logout) لا عند *بدء* واحدة.
      clearServiceWorkerApiCache();
      clearNotificationsCache();

      // FIX T-01: data.user is AuthResultUser (id/name/email/role only).
      // CROSS-ORIGIN-CSRF-FIX: also pass csrfToken from the response
      // body — see auth.store.ts's csrfToken field / lib/csrf.ts for why
      // this in-memory value, not the (cross-origin-unreadable) cookie,
      // is what getCsrfToken() uses.
      setAuth(data.user, data.tokens, data.csrfToken);

      // Set cookies for middleware route protection.
      setAuthCookies(data.user, data.tokens);

      // Best-effort warmup: seed offlineJsonCache + React Query with
      // this user's own seller/store/provider profiles so the create-
      // page gates work offline on their first visit without needing
      // a prior stop at /dashboard or /my-services. See
      // lib/offlineSelfWarm.ts's header for the exact gap this closes.
      // Fire-and-forget — must not delay the toast/navigate below.
      void warmSelfDataForOffline(queryClient);

      // Background fetch to enrich user with avatarUrl/city.
      usersApi.getMe()
        .then((r) => {
          const u = unwrapData(r);
          // FIX ROLE-TYPE-WIDENING: was `role: u.role as 'USER' | 'ADMIN'`
          // — a cast that narrowed from the actual UserRole
          // ('USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN') to just two
          // values. The runtime value was always stored correctly (the
          // cast is compile-time only), but any later comparison like
          // `user.role === 'MODERATOR'` would fail tsc even though the
          // real value could match. AuthUser.role is already UserRole,
          // so no cast is needed at all.
          setUser({ id: u.id, name: u.name, email: u.email,
                    role: u.role,
                    avatarUrl: u.avatarUrl, city: u.city,
                    emailVerified: u.emailVerified });
          queryClient.setQueryData(queryKeys.auth.me(), u);
        })
        .catch(() => { /* non-critical — minimal user still set */ });

      // UX-FIX P-LOGIN-1: same gap as register had before UX-FIX
      // P-REG-1 — the only "did this work?" signal was the page
      // changing underneath the user. Every other success path in the
      // app confirms with a toast; login was the remaining silent
      // exception. Uses the minimal user set by setAuth above (name is
      // always present on AuthResultUser), so this doesn't wait on the
      // background getMe() enrichment call.
      toast.success(`مرحبًا بعودتك، ${data.user.name}!`);

      // FIX AUTH-06: previously always pushed ROUTES.dashboard, ignoring
      // the ?from= redirect target middleware.ts attaches when bouncing
      // an unauthenticated user away from a protected page. getSafeRedirectPath
      // was built and unit-tested for exactly this but never called from
      // here. LoginForm now passes the validated `from` value through.
      router.push(data.redirectTo ?? ROUTES.dashboard);
    },

    // API-INT-02 FIX: was missing — login failures (400 wrong password, 422 validation,
    // 429 rate-limit) were silently swallowed. User saw no feedback.
    onError: (err) => {
      toast.error(parseApiError(err).message);
    },
  });
}

export function useRegister() {
  // PERF-05 FIX: targeted selector.
  const setAuth   = useAuthStore(selectSetAuth);
  const router      = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ redirectTo, ...payload }: RegisterPayload & { redirectTo?: string }) =>
      authApi.register(payload).then((r) => ({ ...unwrapData(r), redirectTo })),

    onSuccess: (data) => {
      // FIX SHARED-DEVICE-LOGIN-LEAK-01: نفس منطق useLogin أعلاه — حساب
      // جديد لا يعني جهازًا نظيفًا؛ قد يحمل بقايا جلسة سابقة انتهت بلا
      // logout نظيف.
      clearServiceWorkerApiCache();
      clearNotificationsCache();

      // CROSS-ORIGIN-CSRF-FIX: see the matching comment in useLogin above.
      setAuth(data.user, data.tokens, data.csrfToken);
      setAuthCookies(data.user, data.tokens);
      // Same best-effort warmup as useLogin above — a fresh account
      // almost never has a profile yet, but if the user completed
      // profile setup in a prior session and is re-registering on a
      // shared device, this still saves a network round trip on the
      // first visit to any create page. Harmless when it 404s.
      void warmSelfDataForOffline(queryClient);
      // Gap #7 (product analytics): completes the signup funnel this
      // event pairs with (see RegisterForm.tsx's SIGNUP_STARTED on
      // mount, and backend's analyticsRepository.signupFunnelSessions).
      track('SIGNUP_COMPLETED');
      // UX-FIX P-REG-1: previously navigated to /dashboard with zero
      // feedback — the only "did this work?" signal was the page
      // changing underneath the user. Every other success path in the
      // app (create ad, update profile, change password, ...) confirms
      // with a toast before/alongside navigating; register was the one
      // silent exception despite being a bigger, one-time moment for a
      // new user.
      toast.success(`مرحبًا ${data.user.name}! تم إنشاء حسابك بنجاح`);
      // AUDIT-FIX auth#1: previously always pushed ROUTES.dashboard,
      // ignoring a ?from= target carried over from middleware.ts (via
      // /login?from=X → "إنشاء حساب" → here). Mirrors useLogin's
      // AUTH-06 fix exactly — RegisterForm now passes the validated
      // `from` value through the same way LoginForm does.
      router.push(data.redirectTo ?? ROUTES.dashboard);
    },

    // API-INT-02 FIX: register can fail with 409 (email taken), 422 (validation).
    // Without onError the form submits into silence.
    onError: (err) => {
      toast.error(parseApiError(err).message);
    },
  });
}

/**
 * AUDIT-FIX auth#3: ForgotPasswordForm/ResetPasswordForm previously
 * called authApi.forgotPassword/resetPassword directly with a hand-
 * rolled useState/try-catch loading flag, the only two forms in this
 * 4-file group not going through React Query like useLogin/useRegister
 * above — no shared queryClient integration, no automatic
 * cancel-on-unmount, slightly different retry behavior. Neither call
 * needs any cache invalidation (there's no signed-in query state yet
 * at this point in the flow), so these are the same shape as
 * useLogin/useRegister minus the auth-store/cookie side effects.
 */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (payload: { email: string }) => authApi.forgotPassword(payload),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (payload: { token: string; newPassword: string }) => authApi.resetPassword(payload),
  });
}

/** Shared "always clear local session state" logic for logout and logout-all. */
function useClearLocalSession() {
  const logout       = useAuthStore(selectLogout);
  const router        = useRouter();
  const queryClient  = useQueryClient();

  return (options?: { destination?: string; toastMessage?: string }) => {
    logout();
    clearAuthCookies();
    // FIX AUTH-CLEANUP-CENTRALIZE-01: القائمة الكاملة موحّدة الآن بـ
    // lib/authCleanup.ts — يستخدمها أيضًا useChangePassword أدناه، فلا
    // يفوت أحدهما خطوة يفعلها الآخر. لا يمسح مسودات إعلانات معلّقة
    // فعليًا (pending_sync/failed) — انظر تعليق الدالة (FIX
    // AD-DRAFT-LOGOUT-DATALOSS-01).
    clearSensitiveLocalData();
    queryClient.clear();
    // FIX CLEAR-SESSION-PARAMETERIZED: the two call-site differences
    // between logout (home, silent) and changePassword (login, toast)
    // used to live as 4 hand-copied lines inside useChangePassword
    // itself. Both are optional so useLogout / useLogoutAll keep their
    // existing behavior unchanged when called with no arguments.
    if (options?.toastMessage) toast.success(options.toastMessage);
    router.push(options?.destination ?? ROUTES.home);
  };
}

export function useLogout() {
  const clearLocalSession = useClearLocalSession();

  return useMutation({
    mutationFn: () => authApi.logout(),
    // Always clear local state regardless of server response.
    // Wrapped in an arrow because clearLocalSession now takes an
    // optional positional arg — onSettled passes (data, error,
    // variables, context) positionally, so the bare reference would
    // bind React Query's `data` to `options`.
    onSettled: () => clearLocalSession(),
  });
}

export function useLogoutAll() {
  const clearLocalSession = useClearLocalSession();

  return useMutation({
    mutationFn: () => authApi.logoutAll(),
    // UX-FIX P1-7: previously only onSettled cleared local state, with no
    // onSuccess/onError at all — the confirmation dialog promises "all
    // sessions will be ended" but the user had no way to tell whether the
    // server actually honored that or the request failed outright (the
    // local logout always happens regardless, per the comment below, so
    // an API failure was invisible).
    onSuccess: () => {
      toast.success('تم تسجيل الخروج من جميع الأجهزة');
    },
    onError: (err) => {
      toast.error(parseApiError(err).message);
    },
    // Always clear local state regardless of server response — this
    // browser's own session should end either way, even if the
    // server-side revocation of *other* devices failed.
    // Wrapped in an arrow for the same reason as useLogout above.
    onSettled: () => clearLocalSession(),
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() });
      // API-INT-03 FIX: was missing success feedback.
      toast.success('تم إنهاء الجلسة');
    },

    // API-INT-03 FIX: was missing — revocation failures were silently ignored.
    onError: (err) => {
      toast.error(parseApiError(err).message);
    },
  });
}

/**
 * FIX SEC-07 (frontend half): the backend now blacklists the *current*
 * access token and revokes every refresh token as soon as a password
 * change succeeds (see users.service.ts changePassword). Previously
 * this form just showed a success toast and left the user sitting on
 * the settings page believing they were still logged in — the very
 * next API call would then fail with a confusing, unexplained 401.
 *
 * FIX AUTH-CLEANUP-CENTRALIZE-01: this used to say "Mirrors
 * useLogout/useLogoutAll's local-session cleanup" but only actually ran
 * 3 of the ~8 cleanup steps (logout/clearAuthCookies/queryClient.clear) —
 * a real drift between the comment and the code, not a deliberate
 * choice. Now genuinely mirrors it via the same clearSensitiveLocalData()
 * used by logout — a password change is exactly the kind of "don't
 * trust this session/device anymore" event that justifies wiping
 * cached notifications/lists/SW caches too, same as it redirects to
 * /login instead of home since the user must re-authenticate anyway.
 */
export function useChangePassword() {
  const clearLocalSession = useClearLocalSession();

  return useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(payload),

    onSuccess: () => {
      // The access token used to make this very request is now
      // blacklisted server-side and every refresh token has been
      // revoked — there is no valid session left to keep locally.
      // FIX CLEAR-SESSION-PARITY: was 4 hand-copied lines from what
      // useClearLocalSession now encapsulates. That's exactly the
      // class of drift FIX AUTH-CLEANUP-CENTRALIZE-01 closed between
      // this function and useLogout — a comment claimed parity while
      // the code ran a shorter list. Same helper now, parameterized
      // for this path's two differences: redirect target (login vs
      // home) and the success toast (useLogout is silent by design).
      clearLocalSession({
        destination: ROUTES.login,
        toastMessage: 'تم تغيير كلمة المرور بنجاح، يرجى تسجيل الدخول من جديد',
      });
    },

    // Deliberately no onError here — SecuritySettingsForm distinguishes
    // a 400 (wrong current password, shown under the field) from other
    // failures (generic toast) itself, and must NOT clear the local
    // session on failure, unlike onSuccess above.
  });
}

/**
 * FIX FEAT-EMAIL-VERIFY: re-sends the verification email for the
 * currently-authenticated user. 3/hour rate limit lives on the backend
 * (resendVerificationRateLimit); this hook just surfaces the outcome
 * as a toast so the banner does not need its own error UI.
 *
 * The error path is meaningful: EMAIL_ALREADY_VERIFIED (the user
 * verified elsewhere between the banner render and the click) and
 * the 429 rate limit are both worth telling the user about.
 */
export function useResendVerification() {
  return useMutation({
    mutationFn: () => authApi.resendVerification(),
    onSuccess: () => {
      toast.success('تم إرسال رابط التأكيد إلى بريدك الإلكتروني');
    },
    onError: (err) => {
      toast.error(parseApiError(err).message);
    },
  });
}
