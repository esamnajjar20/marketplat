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
  if (typeof document === 'undefined') return null; // SSR — nothing to read yet

  // CROSS-ORIGIN-CSRF-FIX: primary source — see this file's header
  // comment. Plain ES import (not require() — see client.ts's own
  // FIX NEXT15-01 comment on why require() breaks @/* alias
  // resolution under Next.js 15). No circular-dependency risk here:
  // auth.store.ts does not import this module.
  const storeToken = useAuthStore.getState().csrfToken;
  if (storeToken) return storeToken;

  // Fallback: same-origin deployments where the cookie is directly readable.
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]*)/);
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : null;
}
