/**
 * PROD-FIX-15: reads the csrfToken cookie the backend sets on
 * login/register/refresh (see backend-v9's shared/utils/authCookies.ts
 * — setCsrfCookie, deliberately NOT httpOnly so this exact code can
 * read it). client.ts's request interceptor echoes this value back as
 * the X-CSRF-Token header on every state-changing request; the backend
 * compares the two (middlewares/csrf.middleware.ts) as a double-submit
 * CSRF check.
 *
 * Reading straight from document.cookie rather than keeping a copy in
 * Zustand/localStorage is deliberate: the cookie itself is already the
 * single source of truth (the backend re-sets it on every
 * login/register/refresh), so duplicating it into app state would just
 * be another place it could go stale relative to the actual cookie.
 */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null; // SSR — no cookies to read

  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]*)/);
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : null;
}
