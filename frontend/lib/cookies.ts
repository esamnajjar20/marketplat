/**
 * Shared cookie utilities for auth state.
 *
 * Both AuthHydrationProvider and useAuthMutations need to read/write
 * the same two cookies. Centralising them here removes the duplication
 * and ensures consistent settings (SameSite, path, max-age).
 *
 * Cookies are non-HttpOnly so that Next.js middleware (Edge Runtime)
 * can read them for route protection without a server-side session.
 *
 * SEC-01 FIX: Added Secure flag in production so the token cookie is
 * never transmitted over plain HTTP.
 */

// FIX BUG-06: was the sole source of truth for the access-token
// cookie's maxAge, hardcoded independently of the backend's actual
// JWT_EXPIRES_IN — if that env var was ever changed in production,
// this constant silently went stale and the cookie could expire
// before (or long after) the token it's meant to shadow actually
// does. Kept only as the fallback cookieMaxAgeFromExpiresIn below uses
// when a response doesn't carry tokens.expiresIn (an older cached
// response, or a test double) — every real call site now prefers the
// backend-supplied value.
export const AUTH_COOKIE_MAX_AGE = 14 * 60; // 14 min — just under the 15 min default JWT TTL

/**
 * FIX BUG-06: derives the app_access_token cookie's maxAge from the
 * backend's own reported token lifetime (AuthTokens.expiresIn, in
 * seconds — see auth.types.ts's doc comment) instead of the fixed
 * AUTH_COOKIE_MAX_AGE constant, so a JWT_EXPIRES_IN change in
 * production takes effect on the client's very next login/refresh
 * with no frontend redeploy needed.
 *
 * Subtracts a fixed 60s safety buffer (mirroring the old constant's
 * own "14 min — just under the 15 min TTL" margin) so the client-side
 * cookie always expires strictly before the JWT it mirrors, never
 * after — a cookie that outlives its token would let middleware.ts
 * treat the visitor as still logged in for up to a minute after the
 * access token backing that belief has already expired server-side.
 * Never returns less than 60s, so a very short-lived token (a test
 * environment configured with JWT_EXPIRES_IN=30s, say) still yields a
 * usable positive maxAge rather than an immediately-expiring cookie.
 */
export function cookieMaxAgeFromExpiresIn(expiresIn: number | undefined): number {
  if (expiresIn === undefined) return AUTH_COOKIE_MAX_AGE;
  return Math.max(60, expiresIn - 60);
}

/**
 * AUDIT-FIX C-1: matches refreshToken's own ~7-day server-side lifetime
 * (see backend authCookies.ts's REFRESH_TOKEN_MAX_AGE_MS). Used for the
 * app_has_session hint cookie — see middleware.ts's file-level doc
 * comment for why this needs a lifetime independent of the short-lived
 * access token cookie above.
 */
export const SESSION_HINT_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

const isProduction = () =>
  typeof window !== 'undefined' && window.location.protocol === 'https:';

export function setCookie(name: string, value: string, maxAge: number): void {
  if (typeof document === 'undefined') return;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `max-age=${maxAge}`,
    'path=/',
    'SameSite=Strict',
  ];
  // SEC-01: Secure flag prevents cookie transmission over HTTP (man-in-the-middle).
  // Only add in production (HTTPS) — omitting it locally avoids breaking http://localhost.
  if (isProduction()) parts.push('Secure');
  document.cookie = parts.join('; ');
}

export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  const parts = [`${name}=`, 'max-age=0', 'path=/', 'SameSite=Strict'];
  if (isProduction()) parts.push('Secure');
  document.cookie = parts.join('; ');
}

// ── Safe post-login redirect ───────────────────────────────────────
//
// SEC-04: The ?from= param written by middleware uses window.location.pathname
// (relative). When a real login form is implemented, use this helper to consume
// the param safely. It ensures the redirect target is always a relative path on
// this origin — preventing open redirect attacks if someone crafts a malicious URL.
//
// Usage in useLogin onSuccess:
//   const from = getSafeRedirectPath(searchParams.get('from'));
//   router.replace(from);

export function getSafeRedirectPath(
  from: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!from) return fallback;
  // Only allow paths that start with / and do NOT start with // (protocol-relative)
  // or contain protocol schemes (e.g. javascript:, data:).
  //
  // Two cases, both validated against the DECODED form (to catch
  // encoded attacks like %2F%2Fevil.com or %2Fjavascript:...):
  //   1. `from` is ALREADY a literal valid path (its own leading `/`
  //      isn't itself percent-encoded) — return it UNCHANGED, so any
  //      percent-encoding inside a query value (e.g. ?city=%D8%BA...)
  //      survives intact rather than being decoded into raw bytes.
  //   2. `from`'s leading `/` only appears after decoding (e.g. the
  //      whole path was encoded as %2Fdashboard) — the encoding was
  //      hiding the path itself, not a data value, so return the
  //      DECODED form.
  if (/^\/[^/]/.test(from) || from === '/') {
    return from;
  }
  // T673 — decodeURIComponent throws URIError on malformed percent
  // sequences (e.g. ?from=% or ?from=%zz). Since `from` is a raw
  // search-param value, a crafted URL could crash the login page's
  // render (or whatever call site consumes this helper). Treating
  // malformed encoding as "no valid redirect target" is both the
  // intended behavior (nothing legitimate encodes a valid path that
  // way) and safe (no uncaught exception).
  let decoded: string;
  try {
    decoded = decodeURIComponent(from);
  } catch {
    return fallback;
  }
  if (/^\/[^/]/.test(decoded) || decoded === '/') {
    return decoded;
  }
  return fallback;
}
