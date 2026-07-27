import { Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * PROD-FIX-15: refreshToken previously came back in the JSON response
 * body (auth.controller.ts) and the frontend stored it in
 * localStorage (store/auth.store.ts) — readable by any JavaScript
 * running on the page, including an attacker's, if this app ever had
 * an XSS vulnerability (accessToken was already memory-only, so this
 * was specifically about the 7-day refreshToken). Moving it into an
 * httpOnly cookie means client-side JS — including malicious injected
 * JS — can no longer read it at all; only the browser can send it back
 * to this exact origin automatically.
 *
 * That fixes one problem (XSS-driven token theft) but introduces
 * another: any cookie the browser sends automatically to matching
 * requests is also sent on cross-site requests a malicious page could
 * trigger (classic CSRF) — a bearer-token-in-header scheme never had
 * this exposure, since a cross-site page has no way to read
 * localStorage or set an Authorization header on the victim's behalf.
 * shared/middlewares/csrf.middleware.ts (see its own header comment)
 * is the other half of this fix, closing that new gap back up.
 *
 * Cookie attributes:
 *   - httpOnly: true — the entire point; inaccessible to JS.
 *   - secure: true in production (HTTPS-only transmission), false in
 *     dev/test so this still works over plain http://localhost.
 *   - sameSite: 'lax' — sent on top-level navigations and same-site
 *     requests, NOT on cross-site subrequests (img/script/fetch from
 *     another origin) or cross-site POSTs, which is most of what CSRF
 *     protection needs structurally; the CSRF token middleware handles
 *     the remaining gap (a same-site-but-still-forged request, or a
 *     browser that doesn't enforce SameSite).
 *
 *     ⚠️  CRITICAL DEPLOYMENT REQUIREMENT: "same-site" here is defined
 *     by eTLD+1 (the registrable domain), NOT by scheme+port. Per the
 *     Chrome/spec definition, `localhost:3000` and `localhost:5000`
 *     ARE same-site (same host, different port — port is irrelevant to
 *     the site boundary), and so are `app.example.com` and
 *     `api.example.com` (same registrable domain `example.com`). This
 *     is why local dev (both on `localhost`, different ports) works
 *     fine without any special config. BUT if the frontend and backend
 *     are ever deployed on genuinely different registrable domains
 *     (e.g. frontend on `my-marketplace.com`, backend on
 *     `my-marketplace-api.io` — different eTLD+1 entirely), the
 *     browser will NOT send this cookie at all on the frontend's calls
 *     to the backend. The practical symptom: every /auth/refresh call
 *     fails with 401 as if no session exists, indistinguishable from a
 *     genuinely logged-out user — login itself still appears to
 *     "succeed" (the Set-Cookie header is sent), but the cookie is
 *     silently dropped by the browser and every subsequent page
 *     load's refresh attempt fails. If this deployment topology is
 *     ever needed, either put both services under the same
 *     registrable domain (e.g. subdomains of one domain, or a reverse
 *     proxy unifying them under one origin) or revisit this to
 *     `sameSite: 'none'` + `secure: true` (which requires HTTPS
 *     everywhere and reopens more of the CSRF surface this cookie's
 *     `sameSite` attribute currently closes — the CSRF middleware
 *     would then be carrying more of the protection burden alone).
 *
 *   - path: '/api/v1/auth' — scopes the cookie so it's only ever sent
 *     to auth endpoints (register/login/refresh/logout), not on every
 *     single API request — /api/v1/ads, /api/v1/categories, etc. never
 *     see this cookie at all, reducing its exposure surface.
 *   - maxAge: matches the refresh token's own 7-day JWT expiry
 *     (signRefreshToken in jwt.ts) — no reason for the cookie to
 *     outlive the token it carries.
 */

const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
const CSRF_COOKIE_NAME = 'csrfToken';
const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — matches signRefreshToken's expiresIn

const isProduction = env.nodeEnv === 'production';

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  // Must repeat the same path/httpOnly/secure/sameSite attributes used
  // when setting the cookie — browsers only clear a cookie whose
  // attributes match exactly (a clearCookie call with different
  // options silently sets a NEW cookie rather than removing the
  // existing one).
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
  });
}

export function getRefreshTokenFromCookie(req: Request): string | undefined {
  return req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
}

/**
 * CSRF token cookie — deliberately NOT httpOnly (the frontend must be
 * able to read it to echo it back in the X-CSRF-Token header; see
 * csrf.middleware.ts). This is the standard "double-submit cookie"
 * pattern: a value only same-origin JS can read AND a cookie the
 * browser sends automatically, compared server-side on every
 * state-changing request. A cross-site attacker can trigger a request
 * that sends the cookie, but cannot read the cookie's value to also
 * set the matching header (browsers enforce same-origin restrictions
 * on reading other sites' cookies), so the two won't match.
 */
export function setCsrfCookie(res: Response): string {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
  return csrfToken;
}

export function clearCsrfCookie(res: Response): void {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

export function getCsrfCookieName(): string {
  return CSRF_COOKIE_NAME;
}

/**
 * AUDIT-FIX C-1 — session hint cookie.
 *
 * Problem this closes: middleware.ts (Next.js Edge Runtime) decides
 * whether a visitor is "logged in" by reading the `app_access_token`
 * cookie — but that cookie is set ONLY by client-side JS (on
 * login/register, and again on every silent refresh — see
 * client.ts's FIX AUTH-03), with a short ~14min max-age matching the
 * access token's own lifetime. On a brand-new page load (new tab,
 * reopened browser, or simply after that cookie's max-age lapses) the
 * httpOnly `refreshToken` cookie set below can still be fully valid
 * for up to 7 days, but middleware runs on the Edge — before any
 * client JS, including AuthHydrationProvider's own `/auth/refresh`
 * call — ever gets a chance to run and prove the session is still
 * good. Result: a fully-logged-in user gets redirected straight to
 * /login on the very first request of a new visit.
 *
 * Fix: set a lightweight, NON-httpOnly cookie alongside refreshToken,
 * with the exact same lifetime and clearing rules. It carries no
 * secret (just the literal string '1') and grants no access by
 * itself — it is a ROUTING HINT only, exactly like `app_user_role`'s
 * existing, already-documented trust model in middleware.ts. The real
 * security boundary remains the backend: every actual API call still
 * requires a valid Bearer access token, independently verified
 * server-side. Middleware now treats "has this hint cookie" as
 * "assume logged in, let AuthHydrationProvider silently refresh and
 * prove it" instead of "assume logged out, redirect immediately" —
 * eliminating the false-logout window without weakening any real
 * authorization check.
 */
const SESSION_HINT_COOKIE_NAME = 'app_has_session';

export function setSessionHintCookie(res: Response): void {
  res.cookie(SESSION_HINT_COOKIE_NAME, '1', {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS, // same 7-day lifetime as refreshToken
  });
}

export function clearSessionHintCookie(res: Response): void {
  res.clearCookie(SESSION_HINT_COOKIE_NAME, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

export function getSessionHintCookieName(): string {
  return SESSION_HINT_COOKIE_NAME;
}
