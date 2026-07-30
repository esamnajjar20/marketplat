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
import { useAuthStore, selectSetAuth, selectSetUser, selectLogout } from '@/store/auth.store';
import { setCookie, deleteCookie, AUTH_COOKIE_MAX_AGE, SESSION_HINT_COOKIE_MAX_AGE } from '@/lib/cookies';
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
  setCookie('app_access_token', tokens.accessToken, AUTH_COOKIE_MAX_AGE);
  setCookie('app_user_role',    user.role,          AUTH_COOKIE_MAX_AGE);
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
export function clearServiceWorkerApiCache() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_API_CACHE' });
}

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
      // FIX T-01: data.user is AuthResultUser (id/name/email/role only).
      setAuth(data.user, data.tokens);

      // Set cookies for middleware route protection.
      setAuthCookies(data.user, data.tokens);

      // Background fetch to enrich user with avatarUrl/city.
      usersApi.getMe()
        .then((r) => {
          const u = unwrapData(r);
          setUser({ id: u.id, name: u.name, email: u.email,
                    role: u.role as 'USER' | 'ADMIN',
                    avatarUrl: u.avatarUrl, city: u.city });
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

  return useMutation({
    mutationFn: (payload: RegisterPayload) =>
      authApi.register(payload).then((r) => unwrapData(r)),

    onSuccess: (data) => {
      setAuth(data.user, data.tokens);
      setAuthCookies(data.user, data.tokens);
      // UX-FIX P-REG-1: previously navigated to /dashboard with zero
      // feedback — the only "did this work?" signal was the page
      // changing underneath the user. Every other success path in the
      // app (create ad, update profile, change password, ...) confirms
      // with a toast before/alongside navigating; register was the one
      // silent exception despite being a bigger, one-time moment for a
      // new user.
      toast.success(`مرحبًا ${data.user.name}! تم إنشاء حسابك بنجاح`);
      router.push(ROUTES.dashboard);
    },

    // API-INT-02 FIX: register can fail with 409 (email taken), 422 (validation).
    // Without onError the form submits into silence.
    onError: (err) => {
      toast.error(parseApiError(err).message);
    },
  });
}

/** Shared "always clear local session state" logic for logout and logout-all. */
function useClearLocalSession() {
  const logout       = useAuthStore(selectLogout);
  const router        = useRouter();
  const queryClient  = useQueryClient();

  return () => {
    logout();
    clearAuthCookies();
    clearServiceWorkerApiCache();
    queryClient.clear();
    router.push(ROUTES.home);
  };
}

export function useLogout() {
  const clearLocalSession = useClearLocalSession();

  return useMutation({
    mutationFn: () => authApi.logout(),
    // Always clear local state regardless of server response.
    onSettled: clearLocalSession,
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
    onSettled: clearLocalSession,
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
 * Mirrors useLogout/useLogoutAll's local-session cleanup, but redirects
 * to the login page (with a clear message) instead of home, since the
 * user specifically needs to re-authenticate with their new password.
 */
export function useChangePassword() {
  const logout = useAuthStore(selectLogout);
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(payload),

    onSuccess: () => {
      // The access token used to make this very request is now
      // blacklisted server-side and every refresh token has been
      // revoked — there is no valid session left to keep locally.
      logout();
      clearAuthCookies();
      queryClient.clear();
      toast.success('تم تغيير كلمة المرور بنجاح، يرجى تسجيل الدخول من جديد');
      router.push(ROUTES.login);
    },

    // Deliberately no onError here — SecuritySettingsForm distinguishes
    // a 400 (wrong current password, shown under the field) from other
    // failures (generic toast) itself, and must NOT clear the local
    // session on failure, unlike onSuccess above.
  });
}
