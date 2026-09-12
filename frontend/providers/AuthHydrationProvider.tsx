/**
 * AuthHydrationProvider
 *
 * Responsibilities:
 *  1. Wait for Zustand persist to rehydrate from localStorage before rendering.
 *  2. After hydration, ALWAYS call /auth/refresh — see PROD-FIX-15 note
 *     below for why this changed from "only if refreshToken exists".
 *  3. Fetch /users/me to populate avatarUrl/city missing from the login response.
 *
 * FIX AUTH-03 + C-04: Sets cookies for Next.js middleware:
 *   - app_access_token  (new access token, expires in 14 min to stay ahead of 15 min TTL)
 *   - app_user_role     (user.role for admin route protection)
 *   - app_has_session   (AUDIT-FIX C-1 — ~7 day hint mirroring the
 *                        backend's own copy; lets middleware avoid a
 *                        false /login redirect on a fresh page load
 *                        where app_access_token has already expired
 *                        but the httpOnly refreshToken is still valid)
 *
 * FIX T-09: setHydrated is only called once (from onRehydrateStorage callback
 *           in auth.store.ts). The useEffect here handles the async refresh flow.
 *
 * FIX PERF-01: Public pages no longer blocked — spinner only shown on
 *              protected/admin routes (handled by their layouts). This provider
 *              renders children immediately; route-level skeletons handle loading.
 *
 * AUDIT-FIX M-1: After a successful /me fetch, eagerly prefetch page 1 of
 *   /favorites so queryKeys.favorites.ids() is populated before the user
 *   ever visits /dashboard or /favorites. Previously useFavorites() (the
 *   only thing that populates the ids Set) was called from just those two
 *   pages, so a user who logged in and went straight to search saw every
 *   heart icon as "not saved" even for ads they'd actually favorited,
 *   until they happened to visit one of those two pages once in the
 *   session. Same prefetch pattern already used here for the user's own
 *   profile — just extended to favorites.
 *
 * PROD-FIX-15: refreshToken moved from localStorage into an httpOnly
 * cookie the backend sets directly (see backend-v9's
 * shared/utils/authCookies.ts) — this component can no longer read it
 * to decide "is there a session worth restoring" the way it used to
 * (`if (!refreshToken) { skip }`). The httpOnly cookie is, by design,
 * invisible to this code; the only way to find out whether a session
 * exists is to actually ask the backend. So this now ALWAYS attempts
 * /auth/refresh on mount:
 *   - If a valid refreshToken cookie exists, the browser sends it
 *     automatically (apiClient's withCredentials:true — see
 *     client.ts) and refresh succeeds, exactly as before.
 *   - If no cookie exists (a genuinely logged-out visitor), the
 *     backend's authController.refresh returns 401 (no refresh token
 *     provided) almost immediately — cheap, and functionally
 *     identical to the old "skip entirely" path from the user's
 *     perspective (falls into the catch block below, calls logout(),
 *     same end state as never having attempted it).
 * The one real behavior change: every page load now makes one extra
 * network round-trip for a logged-out visitor (previously zero, since
 * the old code could tell client-side there was nothing to refresh).
 * That's the unavoidable cost of the token no longer being readable
 * client-side at all — accepted deliberately as the trade for closing
 * the XSS exposure a JS-readable 7-day token represented.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore, selectIsHydrated } from '@/store/auth.store';
import { authApi }    from '@/api/auth.api';
import { usersApi }   from '@/api/users.api';
import { favoritesApi } from '@/api/favorites.api';
import { queryKeys }    from '@/lib/queryKeys';
import { setCookie, deleteCookie, cookieMaxAgeFromExpiresIn, SESSION_HINT_COOKIE_MAX_AGE } from '@/lib/cookies';

/**
 * FIX AUTH-OFFLINE-01: true only when the rejection actually carries an
 * HTTP response — i.e. the backend genuinely answered (401, 500,
 * whatever). false for a pure network failure (device offline, DNS/
 * timeout, or this component's own AbortController firing) — axios
 * always produces a `.response` of `undefined` in that case, never a
 * thrown value with no `.response` property at all.
 *
 * Deliberately NOT using lib/errorParser.ts's parseApiError here: it
 * gates its "real HTTP status" branch on axios.isAxiosError(), which
 * checks the internal `isAxiosError: true` marker axios stamps onto
 * its own error instances — a marker that (correctly) isn't present on
 * a hand-built `{ response: { status: 401 } }` test double, so
 * parseApiError would misclassify every such mock as "network failure"
 * too. This check only cares whether *some* `.response` is present,
 * which matches both a real AxiosError's shape and how this file's own
 * tests already model a genuine server rejection.
 */
function hasServerResponse(err: unknown): boolean {
  return !!(err && typeof err === 'object' && 'response' in err && (err as { response?: unknown }).response != null);
}

// FIX BUG-06: was a fixed re-export of AUTH_COOKIE_MAX_AGE — the
// refresh response's own tokens.expiresIn (captured below, right
// before this constant would previously have been used) now drives
// the actual maxAge via cookieMaxAgeFromExpiresIn instead.

interface AuthHydrationProviderProps {
  children: React.ReactNode;
}

export function AuthHydrationProvider({ children }: AuthHydrationProviderProps) {
  const isHydrated = useAuthStore(selectIsHydrated);
  const { setAccessToken, setCsrfToken, setUser, logout, setAuthResolved } = useAuthStore.getState();
  const queryClient = useQueryClient();

  const hasRunRef = useRef(false);

  useEffect(() => {
    // Only run once after Zustand has rehydrated from localStorage.
    if (!isHydrated || hasRunRef.current) return;
    hasRunRef.current = true;

    // API-INT-05 FIX: Wrap the entire auth-restore flow in a timeout.
    // Without this, a dead network (no response at all) causes the app to
    // hang in a semi-hydrated state indefinitely — isAuthenticated stays
    // false (since setAccessToken was never called) but no error is surfaced.
    // 8 seconds is generous: refresh + /me combined.
    //
    // FIX AUTH-05: previously the AbortController's signal was created
    // but never passed into authApi.refresh()/usersApi.getMe(), so
    // controller.abort() after 8s did nothing — the real bound was each
    // axios call's own 15s timeout (up to 30s for both, sequentially).
    // Now the signal is threaded through both calls so the 8s timeout
    // documented here is the one that actually applies.
    //
    // Declared here (not inside the IIFE below) so the effect's own
    // cleanup function — which aborts on unmount — can reach the same
    // controller instance; it previously lived inside the IIFE and was
    // out of scope for that cleanup, causing a ReferenceError.
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8_000);

    (async () => {
      try {
        // 1. Get a fresh access token. PROD-FIX-15: no refreshToken
        // argument anymore — the httpOnly cookie (if any) rides along
        // automatically via apiClient's withCredentials:true.
        const refreshRes = await authApi.refresh({ signal: controller.signal });
        const { accessToken: newAccess, expiresIn } = refreshRes.data.data!.tokens;

        setAccessToken(newAccess);
        // CROSS-ORIGIN-CSRF-FIX: this is the exact call that was
        // failing with 403 on every page reload — frontend and backend
        // are on different origins, so document.cookie can never see
        // the backend-origin-only csrfToken cookie (see lib/csrf.ts's
        // header comment for the full mechanism). Capture the value
        // from this response body instead, into the in-memory store
        // getCsrfToken() now reads from first.
        setCsrfToken(refreshRes.data.data!.csrfToken);

        // 2. Set middleware cookies so route protection works.
        // FIX BUG-06: derives maxAge from this response's own
        // tokens.expiresIn instead of the old fixed constant — reused
        // below for app_user_role too, since both cookies represent
        // the same access-token-backed session and should expire
        // together.
        const cookieMaxAge = cookieMaxAgeFromExpiresIn(expiresIn);
        setCookie('app_access_token', newAccess, cookieMaxAge);
        // AUDIT-FIX C-1: re-assert the session hint too (the backend
        // already set/refreshed its own copy via Set-Cookie on this
        // same /auth/refresh response — this client-side mirror just
        // means middleware doesn't have to wait on cookie propagation
        // timing before its very next request sees it).
        setCookie('app_has_session', '1', SESSION_HINT_COOKIE_MAX_AGE);

        // 3. Fetch full profile to get avatarUrl, city, and confirm role.
        const meRes  = await usersApi.getMe({ signal: controller.signal });
        const user   = meRes.data.data;
        if (!user) throw new Error('empty /users/me response');
        setUser({
          id:        user.id,
          name:      user.name,
          email:     user.email,
          role:      user.role as 'USER' | 'ADMIN',
          avatarUrl: user.avatarUrl,
          city:      user.city,
        });
        // Set role cookie for middleware admin check.
        setCookie('app_user_role', user.role, cookieMaxAge);

        // AUDIT-FIX M-1: prefetch page 1 of favorites so the ids Set is
        // populated app-wide before the user visits /dashboard or
        // /favorites. Best-effort — a failure here shouldn't sign the
        // user out or block the rest of hydration, so it's isolated in
        // its own try/catch and awaited (not fire-and-forget) only to
        // keep it inside this function's existing 8s abort window.
        try {
          // FIX AUTH-05b: pass the same signal used for refresh/getMe so
          // this call is actually cancelled by the 8s timeout or an
          // unmount, instead of running to completion in the background
          // regardless (see favoritesApi.getAll's doc comment).
          const favRes = await favoritesApi.getAll({ page: 1 }, { signal: controller.signal });
          const favData = favRes.data.data; // { items: FavoriteRecord[]; meta: PaginationMeta }
          if (!favData) throw new Error('empty /favorites response');
          const idSet   = new Set(favData.items.map((fav) => fav.ad.id));
          // Only seed the ids Set (the actual source of useIsFavorited()).
          // Deliberately NOT seeding queryKeys.favorites.all(...) here:
          // FavoritesList/DashboardStats call useFavorites() with different
          // params ({ page } vs none), producing different cache keys than
          // whatever this prefetch would use — seeding the wrong key would
          // just be dead cache, not a correctness issue, but there's no
          // reason to carry it.
          queryClient.setQueryData(queryKeys.favorites.ids(), idSet);
        } catch {
          // Non-fatal: heart icons just fall back to the old
          // "populate on first visit to /dashboard or /favorites"
          // behavior for this session.
        }

      } catch (err) {
        // FIX AUTH-OFFLINE-01: this used to call logout() unconditionally
        // on ANY failure here — including a bare network error (device
        // offline, DNS down, server unreachable), which is NOT the same
        // thing as the backend confirming "this session is invalid."
        // hasServerResponse() (defined above) is true only when the
        // backend actually answered (401, 500, whatever); a pure network
        // failure never carries a `.response`.
        //
        // Before this fix: disconnecting the internet and then loading
        // (or reloading) the app — which is exactly when this effect
        // runs, since it always fires once on mount per PROD-FIX-15 above
        // — looked identical to a truly expired session. logout() wiped
        // the persisted `user` (so even the header/avatar vanished) and
        // deleted app_access_token/app_user_role/app_has_session, then
        // ProtectedLayout (isAuthenticated now false) redirected straight
        // to /login. That redirect is also *why* offline-cached content
        // (conversations, notifications — anything behind that layout)
        // never had a chance to render: the user was bounced away from
        // the page before ever reaching the cached shell/data this app
        // otherwise keeps for exactly this situation.
        //
        // Fix: on a network failure specifically, don't touch anything —
        // leave the persisted `user` and session cookies exactly as they
        // were. isAuthenticated stays false (it was never proven true
        // this load either way), but ProtectedLayout now treats "offline
        // + a persisted user" as reason enough to render its cached
        // children instead of redirecting (see that file). The very next
        // successful refresh (automatic retry, or simply coming back
        // online and reloading) resolves this for real in either
        // direction — confirms the session and flips isAuthenticated
        // true, or genuinely rejects it and logs out then, once that's
        // an actual answer from the server instead of a guess.
        if (hasServerResponse(err)) {
          logout();
          deleteCookie('app_access_token');
          deleteCookie('app_user_role');
          deleteCookie('app_has_session'); // AUDIT-FIX C-1
        } else if (
          typeof navigator !== 'undefined' &&
          navigator.onLine === false
        ) {
          // FIX AUTH-OFFLINE-SESSION-01 / FIX AUTH-401-STORM-01:
          // فقط عند أوفلاين حقيقي. لا تضبط isAuthenticated وأنت أونلاين
          // بعد timeout/abort — ذلك يفتح سيل طلبات بلا Bearer → 401.
          const persisted = useAuthStore.getState().user;
          if (persisted) {
            useAuthStore.getState().setAccessToken(
              useAuthStore.getState().accessToken ?? '',
            );
          }
        }
        // أونلاين + فشل بلا رد سيرفر: اترك isAuthenticated=false؛ user يبقى.
      } finally {
        clearTimeout(timeout);
        // FIX AUTH-04: always mark the restore flow as settled, success
        // or failure, so ProtectedLayout/AdminLayout stop waiting.
        setAuthResolved();
      }
    })();

    // Abort any in-flight refresh/me/favorites calls if this component
    // unmounts before the flow settles (e.g. the user navigates away,
    // or — in tests — the next test renders a new instance without a
    // previous one having finished). Without this, the async IIFE above
    // keeps running after unmount and can still call store setters.
    return () => controller.abort();
  }, [
    isHydrated,
    logout,
    queryClient,
    setAccessToken,
    setAuthResolved,
    setCsrfToken,
    setUser,
  ]);

  // FIX PERF-01: No blocking spinner here — render children immediately.
  // Protected/admin layouts show their own skeleton while auth resolves.
  return <>{children}</>;
}
