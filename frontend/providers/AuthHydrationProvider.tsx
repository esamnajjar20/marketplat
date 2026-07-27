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
import { setCookie, deleteCookie, AUTH_COOKIE_MAX_AGE, SESSION_HINT_COOKIE_MAX_AGE } from '@/lib/cookies';

const COOKIE_MAX_AGE = AUTH_COOKIE_MAX_AGE;

interface AuthHydrationProviderProps {
  children: React.ReactNode;
}

export function AuthHydrationProvider({ children }: AuthHydrationProviderProps) {
  const isHydrated = useAuthStore(selectIsHydrated);
  const { setAccessToken, setUser, logout, setAuthResolved } = useAuthStore.getState();
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
        const { accessToken: newAccess } = refreshRes.data.data!.tokens;

        setAccessToken(newAccess);

        // 2. Set middleware cookies so route protection works.
        setCookie('app_access_token', newAccess, COOKIE_MAX_AGE);
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
        setCookie('app_user_role', user.role, COOKIE_MAX_AGE);

        // AUDIT-FIX M-1: prefetch page 1 of favorites so the ids Set is
        // populated app-wide before the user visits /dashboard or
        // /favorites. Best-effort — a failure here shouldn't sign the
        // user out or block the rest of hydration, so it's isolated in
        // its own try/catch and awaited (not fire-and-forget) only to
        // keep it inside this function's existing 8s abort window.
        try {
          const favRes = await favoritesApi.getAll({ page: 1 });
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

      } catch {
        // Refresh or /me failed (or timed out) — no valid session
        // (this is the normal, expected path for a logged-out
        // visitor now that there's no client-readable token to check
        // first — see this component's own header comment). Sign out
        // cleanly either way.
        logout();
        deleteCookie('app_access_token');
        deleteCookie('app_user_role');
        deleteCookie('app_has_session'); // AUDIT-FIX C-1
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
  }, [isHydrated]);

  // FIX PERF-01: No blocking spinner here — render children immediately.
  // Protected/admin layouts show their own skeleton while auth resolves.
  return <>{children}</>;
}
