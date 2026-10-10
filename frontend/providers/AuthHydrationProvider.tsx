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
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore, selectIsHydrated } from '@/store/auth.store';
import { usersApi }   from '@/api/users.api';
import { favoritesApi } from '@/api/favorites.api';
import { getNetworkPolicy } from '@/lib/networkPolicy';
import { queryKeys }    from '@/lib/queryKeys';
import { CACHE_TTL, ROUTES }    from '@/lib/constants';
import { setCookie, deleteCookie, cookieMaxAgeFromExpiresIn, clearAuthCookies } from '@/lib/cookies';
import { warmSelfDataForOffline } from '@/lib/offlineSelfWarm';
// T735 — see the check just after the refresh await below.
import {
  isSessionRevoked,
  refreshSessionShared,
} from '@/api/client';
import { parseApiError } from '@/lib/errorParser';
import { clearSensitiveLocalData } from '@/lib/authCleanup';
import { subscribeToSessionEnded } from '@/lib/authSessionBroadcast';

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
  const router = useRouter();
  const sessionEventHandlingRef = useRef(false);

  useEffect(() => {
    return subscribeToSessionEnded(() => {
      if (sessionEventHandlingRef.current) return;
      sessionEventHandlingRef.current = true;

      // The initiating tab already invalidated the server session. A sibling
      // tab must not call the logout API again; it only needs to terminate its
      // local state and purge user-scoped data before navigating away.
      useAuthStore.getState().logout();
      clearAuthCookies();
      void clearSensitiveLocalData().finally(() => {
        router.replace(ROUTES.login);
      });
    });
  }, [router]);

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
    // AUTH-RACE-TIMEOUT-01: raised from 8s. Two concurrent
    // /auth/refresh calls can run at page load (this one and the SW's
    // queue-replay one). When this request loses the race it receives
    // a 401 TOKEN_MISMATCH — the retry logic below catches that, but
    // the request must survive long enough to actually get the 401
    // response rather than being aborted first. 15s is comfortably
    // above the backend's normal response time and below the point at
    // which a user would consider the page hung.
    const timeout    = setTimeout(() => controller.abort(), 15_000);

    (async () => {
      try {
        // 1. Get a fresh access token. PROD-FIX-15: no refreshToken
        // argument anymore — the httpOnly cookie (if any) rides along
        // automatically via apiClient's withCredentials:true.
        const refreshRes = await refreshSessionShared();
        const { expiresIn } = refreshRes.data.data!.tokens;

        // T735 — the user could have logged out between this request
        // being sent and its response arriving. clearSensitiveLocalData()
        // (invoked by every logout path: useAuthMutations, session
        // expiry, password change) sets the sessionRevoked flag via
        // invalidateRefreshSession(). Without this check, the resolved
        // the shared refresh coordinator would update the access token
        // and session cookies and effectively re-establish the session
        // the user just ended — the exact class of leak T651 closed
        // inside the response interceptor, in a different code path.
        // path with the same consequence on a shared device.
        // T735-REVERTED: temporarily disabled — see "logs me out on
        // every refresh" production regression. The check was meant to
        // discard a refresh response that raced a logout, but if the
        // sessionRevoked flag is ever true when this runs (module-level
        // state from a prior authCleanup call), it returns without
        // updating the auth store, so isAuthenticated stays false and
        // ProtectedLayout redirects to /login. Re-enable after root
        // cause is identified.
        // if (isSessionRevoked()) { return; }

        // CROSS-ORIGIN-CSRF-FIX: this is the exact call that was
        // failing with 403 on every page reload — frontend and backend
        // are on different origins, so document.cookie can never see
        // the backend-origin-only csrfToken cookie (see lib/csrf.ts's
        // header comment for the full mechanism). Capture the value
        // from this response body instead, into the in-memory store
        // getCsrfToken() now reads from first.

        // 2. Derive the session cookie lifetime from the refresh response.
        // Reused below for app_user_role so it expires with the
        // same access-token-backed session.
        const cookieMaxAge = cookieMaxAgeFromExpiresIn(expiresIn);

        // 3. Fetch full profile to get avatarUrl, city, and confirm role.
        // FIX ME-QUERY-UNIFY-01: was a direct usersApi.getMe() call
        // here, outside React Query. Three consequences on any page
        // that also mounts a useMe() consumer (ProfileSettingsForm,
        // NotificationSettingsForm) — a second /users/me fired in
        // parallel from useMe() because it couldn't see this request,
        // and the store write below landed the same data into two
        // independent paths. Now routed through
        // queryClient.fetchQuery on the same auth.me() key, so the
        // hook's own request dedupes with this one and the query
        // cache stays in sync from a single source.
        // controller.signal is still passed through the queryFn so
        // the outer abort semantics are preserved.
        // BOOTSTRAP-01: one /users/me/bootstrap instead of parallel
        // /me + unread×2 + notifications + seller + stats + favorites.
        const bootstrap = await usersApi
          .getBootstrap({ signal: controller.signal })
          .then((r) => r.data.data);
        if (!bootstrap?.me) throw new Error('empty /users/me/bootstrap response');
        const user = bootstrap.me;

        // Seed the same keys individual hooks read so NotificationBell,
        // MessagesLink, useMe, useMySellerProfile, useMyAdStats, and
        // useFavorites do not fire duplicate network requests.
        queryClient.setQueryData(queryKeys.auth.me(), user);
        // useUnreadNotificationCount / useUnreadConversationCount return a number
        queryClient.setQueryData(
          queryKeys.notifications.unreadCount(),
          bootstrap.notificationsUnread,
        );
        queryClient.setQueryData(
          queryKeys.conversations.unreadCount(),
          bootstrap.conversationsUnread,
        );
        if (bootstrap.notifications) {
          queryClient.setQueryData(
            queryKeys.notifications.mine({ limit: 10 }),
            bootstrap.notifications,
          );
        }
        if (bootstrap.sellerProfile !== undefined) {
          queryClient.setQueryData(queryKeys.sellers.me(), bootstrap.sellerProfile);
        }
        if (bootstrap.store != null) {
          queryClient.setQueryData(queryKeys.stores.me(), bootstrap.store);
        }
        if (bootstrap.serviceProvider != null) {
          queryClient.setQueryData(queryKeys.serviceProviders.me(), bootstrap.serviceProvider);
        }
        if (bootstrap.sellerAttention) {
          queryClient.setQueryData(
            queryKeys.sellers.attention(),
            bootstrap.sellerAttention,
          );
        }
        if (bootstrap.adStats) {
          queryClient.setQueryData(queryKeys.ads.myStats(), bootstrap.adStats);
        }
        if (bootstrap.favorites) {
          queryClient.setQueryData(
            queryKeys.favorites.all({ page: 1 }),
            bootstrap.favorites,
          );
          const idSet = new Set<string>();
          for (const fav of bootstrap.favorites.items as Array<{ adId?: string; entityId?: string; ad?: { id?: string } }>) {
            const id = fav?.adId ?? fav?.entityId ?? fav?.ad?.id;
            if (typeof id === 'string') idSet.add(id);
          }
          if (idSet.size > 0) {
            queryClient.setQueryData(queryKeys.favorites.ids(), idSet);
          }
        }
        setUser({
          id:        user.id,
          name:      user.name,
          email:     user.email,
          // FIX ROLE-TYPE-WIDENING: see hooks/mutations/useAuthMutations.ts's
          // matching comment — same narrowing cast, removed for the same
          // reason.
          role:      user.role,
          avatarUrl: user.avatarUrl,
          city:      user.city,
          // FEAT-GOOGLE-COMPLETE-PROFILE: needed so ProfileCompletionGate
          // can redirect a fresh Google signup — the redirect from
          // authController.googleCallback already lands here, but this
          // is also what covers a returning session on a later visit
          // before the form is ever submitted.
          needsProfileCompletion: user.needsProfileCompletion,
          emailVerified: user.emailVerified,
        });
        // Set role cookie for middleware admin check.
        setCookie('app_user_role', user.role, cookieMaxAge);

        // Best-effort: prefetch this user's own seller/store/provider
        // profiles so the create-page gates (CreateAdGate,
        // CreateProductGate, CreateServiceListingGate) can render their
        // real forms on the very first offline visit — without needing
        // the user to have visited /dashboard or /my-services once first
        // to populate offlineJsonCache. See lib/offlineSelfWarm.ts's
        // own header for the exact gap this closes. Fire-and-forget:
        // intentionally NOT threaded through `controller.signal`, so a
        // slow network doesn't extend this effect's own 8s window and
        // an early unmount doesn't cancel the warmup for nothing.
        void warmSelfDataForOffline(queryClient, user.id);

        // AUDIT-FIX M-1: prefetch page 1 of favorites so the ids Set is
        // populated app-wide before the user visits /dashboard or
        // /favorites. Best-effort — a failure here shouldn't sign the
        // user out or block the rest of hydration, so it's isolated in
        // its own try/catch and awaited (not fire-and-forget) only to
        // keep it inside this function's existing 8s abort window.
        // FAVORITES-PREFETCH-IDLE: used to run synchronously inside
        // the hydration effect, blocking the 8s abort window and
        // sending a 6.2KB /favorites?page=1 request on every route
        // (public pages included, since this provider mounts at the
        // root). On Gaza's links that competed directly with the
        // page's own data for one of Chrome's six connections, and
        // was wasted entirely on guests who never open /favorites or
        // the dashboard hearts. Deferred to requestIdleCallback so it
        // runs after the first paint settles, still within a 5s
        // deadline, and skips entirely on saveData/slow links where
        // the race was worst. Same ME-QUERY-UNIFY-02 reasoning still
        // applies once it does run: fetchQuery on the exact key the
        // hook reads, so no duplicate request later.
        const prefetchFavoritesIdle = () => {
          if (typeof window === 'undefined') return;
          if (!getNetworkPolicy().allowPrefetch) return;

          const run = () => {
            void (async () => {
              try {
                const favData = await queryClient.fetchQuery({
                  queryKey: queryKeys.favorites.all({ page: 1 }),
                  queryFn: () =>
                    favoritesApi
                      .getAll({ page: 1 })
                      .then((r) => r.data.data),
                  staleTime: CACHE_TTL.favorites,
                });
                // T750 — the requestIdleCallback above can fire up to 5s
                // after the auth flow settled, and a logout may have run
                // in that window. clearSensitiveLocalData() already
                // called queryClient.clear() and set sessionRevoked via
                // invalidateRefreshSession() — writing the favorites
                // Set now would repopulate a cache entry the cleanup
                // just wiped. Mirrors the T735 check earlier in this
                // same file. Cost is tiny (Set of ad IDs), but the
                // consistency matters: every "write after logout"
                // path should respect the same signal.
                if (isSessionRevoked()) return;
                if (!favData) return;
                const idSet = new Set(favData.items.map((fav) => fav.ad.id));
                queryClient.setQueryData(queryKeys.favorites.ids(), idSet);
              } catch {
                // Non-fatal: hearts fall back to first-visit population.
              }
            })();
          };

          const w = window as Window & {
            requestIdleCallback?: (
              cb: () => void,
              opts?: { timeout: number },
            ) => number;
          };
          if (typeof w.requestIdleCallback === 'function') {
            w.requestIdleCallback(run, { timeout: 5000 });
          } else {
            window.setTimeout(run, 1500);
          }
        };
        prefetchFavoritesIdle();

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
        // AUTH-RACE-TIMEOUT-01 — the initial /auth/refresh can lose a
        // race with the Service Worker's queue-replay refresh (see
        // refreshAccessToken in sw.js). Both requests hit the
        // backend's atomicRefreshRotate Lua script: one wins and
        // rotates the refreshToken cookie, the other 401s with
        // TOKEN_MISMATCH. The loser here needs to retry once, because
        // the browser cookie has ALREADY been rotated by the winner —
        // a second request with the fresh cookie succeeds normally.
        //
        // Without this retry, the loser path left isAuthenticated=false
        // and ProtectedLayout's 900ms timer then redirected the user to
        // /login on every page load — the exact regression reported as
        // "يخرجني من حسابي على كل ريفرش".
        //
        // Only triggers when (a) the error is an HTTP 401 (not a network
        // failure) AND (b) a persisted user exists (meaning we had a
        // session at load time). A genuinely-expired session still 401s
        // on the retry, so this only delays the failure path by ~1s.
        const initialParsed = parseApiError(err);
        const persistedUser = useAuthStore.getState().user;
        if (
          initialParsed.statusCode === 401 &&
          persistedUser &&
          !isSessionRevoked()
        ) {
          try {
            // Brief delay: give the winning SW refresh time to finish
            // and for the browser to persist the rotated Set-Cookie.
            await new Promise((r) => setTimeout(r, 700));
            if (isSessionRevoked()) return;

            const retryRes = await refreshSessionShared();
            const { expiresIn: retryExpires } =
              retryRes.data.data!.tokens;
            if (isSessionRevoked()) return;

            const retryBootstrap = await usersApi
              .getBootstrap({ signal: controller.signal })
              .then((r) => r.data.data);
            const retryUser = retryBootstrap?.me;
            if (retryUser) {
              queryClient.setQueryData(queryKeys.auth.me(), retryUser);
              queryClient.setQueryData(
                queryKeys.notifications.unreadCount(),
                retryBootstrap.notificationsUnread,
              );
              queryClient.setQueryData(
                queryKeys.conversations.unreadCount(),
                retryBootstrap.conversationsUnread,
              );
            }
            if (!retryUser) throw new Error('empty /users/me response on retry');
            setUser({
              id:        retryUser.id,
              name:      retryUser.name,
              email:     retryUser.email,
              role:      retryUser.role,
              avatarUrl: retryUser.avatarUrl,
              city:      retryUser.city,
              needsProfileCompletion: retryUser.needsProfileCompletion,
              emailVerified: retryUser.emailVerified,
            });
            const retryCookieMaxAge =
              cookieMaxAgeFromExpiresIn(retryExpires);
            setCookie('app_user_role', retryUser.role, retryCookieMaxAge);

            void warmSelfDataForOffline(queryClient, retryUser.id);
            console.info('[auth] session recovered after refresh-race retry');
            return; // success — skip the original error handling entirely
          } catch (retryErr) {
            // Retry also failed. Fall through — the original err is
            // likely a genuine session-expired response.
            console.warn('[auth] refresh retry failed:', retryErr);
          }
        }

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

    // T737 — deliberately do NOT abort on cleanup. The previous code
    // called controller.abort() here, which broke auth hydration in dev
    // under React StrictMode: StrictMode's simulated unmount/remount
    // fires this cleanup immediately after the effect, and since
    // hasRunRef.current was already set to true, the effect does not
    // re-run on the simulated remount. The in-flight IIFE was aborted
    // mid-flight, its catch treated AbortError as a pure network
    // failure (no `.response` — see hasServerResponse), the `finally`
    // ran setAuthResolved() with isAuthenticated still false, and every
    // protected page then bounced the user to /login even though their
    // session was perfectly valid. StrictMode double-invokes ONLY in
    // development, so this was a dev-only symptom — but it made
    // signed-in flows nearly untestable under `next dev`.
    //
    // Not aborting is safe in production too: this provider sits at the
    // root of AppProviders, so its real unmount means the whole app is
    // being torn down (a full page unload kills the IIFE anyway). On a
    // transient root remount, the IIFE's setters write to the global
    // Zustand store — harmless, and the store is the single source of
    // truth for anyone who renders after. The 8s timeout above already
    // bounds the flow's worst case.
    return () => clearTimeout(timeout);
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
