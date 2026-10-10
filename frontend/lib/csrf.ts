import { useAuthStore } from '@/store/auth.store';

/**
 * PROD-FIX-15 (superseded by CROSS-ORIGIN-CSRF-FIX below): originally
 * read the csrfToken cookie the backend sets on login/register/refresh
 * (backend-v9's shared/utils/authCookies.ts — setCsrfCookie,
 * deliberately NOT httpOnly). client.ts's request interceptor echoes
 * this value back as the X-CSRF-Token header on every state-changing
 * request; the backend compares the two (middlewares/csrf.middleware.ts)
 * as a double-submit CSRF check.
 *
 * CROSS-ORIGIN-CSRF-FIX: that document.cookie read only works when the
 * frontend and backend share an origin. On this deployment they're on
 * two different *.up.railway.app hosts — different origins, and (since
 * up.railway.app is on the Public Suffix List) different *sites*
 * entirely. Cookie *readability via JS* is scoped strictly to the
 * origin that set the cookie, independent of SameSite (SameSite only
 * governs whether the browser *attaches* the cookie to an outgoing
 * cross-site request — a separate mechanism). Backend sets csrfToken
 * with no explicit Domain, so it's host-only bound to the backend's
 * own origin: the browser still attaches it to requests TO the backend
 * (confirmed in prod — it appears in the request's `cookie:` header),
 * but frontend JS on the *different* frontend origin can never read it
 * via document.cookie. That's a structural mismatch, not a timing bug:
 * getCsrfToken() always returned null here, X-CSRF-Token was never
 * sent, and csrf.middleware.ts rejects "cookie present, header
 * missing" with 403 — on every state-changing request, including
 * /auth/refresh itself right after a page reload.
 *
 * Fix: read from the in-memory auth store instead. The backend already
 * includes csrfToken directly in the JSON response body of
 * login/register/refresh (see types/auth.types.ts's LoginResponseData /
 * RefreshResponseData) specifically so a split-origin frontend has a
 * same-origin-safe way to obtain the value — only code running on this
 * exact page could have read that fetch response body, which is the
 * same "attacker can't get it" property the cookie-read was meant to
 * provide. auth.store.ts's setAuth/setCsrfToken populate it on
 * login/register/refresh (see client.ts and AuthHydrationProvider.tsx).
 *
 * The document.cookie read is kept as a fallback (not removed) for a
 * same-origin deployment (see authCookies.ts's own "DEPLOYMENT NOTE" —
 * unifying frontend/backend under one registrable domain remains the
 * more robust long-term fix) where the cookie IS readable and would
 * still work even before any store value is populated.
 */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null; // SSR

  // SAME-ORIGIN-CSRF-PRIORITY (2026-10-10): the API is now served from
  // the same origin as the app (Workers + /api/* rewrites), so the
  // csrfToken cookie the backend sets on login/register/refresh IS
  // directly readable via document.cookie here.
  //
  // Read the cookie FIRST — it is always the freshest value:
  //   - The browser updates the cookie from Set-Cookie the instant
  //     the response HEADERS arrive.
  //   - The in-memory store only updates after the response BODY is
  //     parsed (client.ts -> setCsrfToken).
  //   - A request that fires between those two moments (presence
  //     heartbeat, SSE re-auth, any mutation) would otherwise attach
  //     the stale store value as X-CSRF-Token while the browser sends
  //     the new cookie -> cookieToken !== headerToken -> the backend's
  //     csrf.middleware.ts rejects with 403 "Invalid or missing CSRF
  //     token". This was the root cause of the intermittent
  //     PATCH /users/me/presence 403s after /auth/refresh.
  //
  // The store stays as a fallback for the brief window before the
  // first Set-Cookie of a session (initial hydration) — auth.store.ts's
  // setCsrfToken fills it from the login/register/refresh JSON body.
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]*)/);
  const cookieToken = match?.[1];
  if (cookieToken !== undefined && cookieToken.length > 0) {
    return decodeURIComponent(cookieToken);
  }

  const storeToken = useAuthStore.getState().csrfToken;
  return storeToken ?? null;
}
