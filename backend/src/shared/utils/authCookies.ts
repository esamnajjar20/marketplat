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
 *   - secure: true, always (required by sameSite:'none' below —
 *     browsers reject that combination without Secure).
 *   - sameSite: 'none' — DEPLOY-FIX-01: this app is deployed with the
 *     frontend and backend on two different *.up.railway.app
 *     subdomains. `up.railway.app` is itself on the Public Suffix
 *     List, so those two hostnames are different *sites* to the
 *     browser — not just different origins — and a 'lax' (or
 *     'strict') cookie is NEVER sent across that boundary, full stop.
 *     That was silently dropping this cookie on every /auth/refresh
 *     call, indistinguishable from a logged-out visitor: login still
 *     appeared to "succeed" (Set-Cookie was sent), but the very next
 *     page refresh's refresh-token request arrived with no cookie at
 *     all, so the user was logged out on every reload. 'none' is the
 *     only sameSite value that crosses a site boundary at all — the
 *     CSRF token middleware (see setCsrfCookie below) now carries
 *     correspondingly more of the CSRF-protection burden alone, since
 *     'lax' is no longer doing any of that work for these cookies.
 *
 *     ⚠️  DEPLOYMENT NOTE: "same-site" is defined by eTLD+1 (the
 *     registrable domain), NOT by scheme+port — `app.example.com` and
 *     `api.example.com` ARE same-site (same registrable domain
 *     `example.com`), and `sameSite: 'lax'` would work fine and be
 *     the better, more restrictive choice if this app is ever moved
 *     onto one real registrable domain (e.g. subdomains of one owned
 *     domain, or a reverse proxy unifying both services under one
 *     origin) instead of Railway's auto-generated *.up.railway.app
 *     hostnames. That remains the more robust long-term fix; revert
 *     to 'lax' (and secure: isProduction, if dev/test needs plain
 *     http:// again) if that migration happens.
 *
 *   - path: '/api/v1/auth' — scopes the cookie so it's only ever sent
 *     to auth endpoints (register/login/refresh/logout), not on every
 *     single API request — /api/v1/ads, /api/v1/categories, etc. never
 *     see this cookie at all, reducing its exposure surface.
 *   - maxAge: matches the refresh token's own JWT expiry (env.jwt.
 *     refreshExpiresIn, default 7d — see signRefreshToken in jwt.ts)
 *     — no reason for the cookie to outlive the token it carries.
 */

const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
const CSRF_COOKIE_NAME = 'csrfToken';
const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';
// Was hardcoded here as `7 * 24 * 60 * 60 * 1000` with a comment asking
// whoever changes signRefreshToken's expiry to remember to update this
// too. Now both read from env.jwt.refreshExpiresIn(Seconds) (see
// config/env.ts), so a JWT_REFRESH_EXPIRES_IN change updates both
// automatically and can't drift out of sync again.
const REFRESH_TOKEN_MAX_AGE_MS = env.jwt.refreshExpiresInSeconds * 1000;

const isProduction = env.nodeEnv === 'production';

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    // DEPLOY-FIX-01: frontend and backend are deployed on two
    // different *.up.railway.app subdomains — and up.railway.app
    // itself is on the Public Suffix List, so those subdomains are
    // different *sites* to the browser (not just different origins).
    // 'lax' cookies are never sent across a site boundary regardless
    // of this being a same-registrable-domain-looking hostname, so
    // every /auth/refresh call was silently arriving with no cookie
    // at all — indistinguishable from a logged-out visitor — which is
    // what caused every page refresh to log users out. sameSite:
    // 'none' is required to cross that boundary, which in turn
    // requires secure: true unconditionally (browsers reject
    // sameSite:'none' without Secure) — not gated behind
    // isProduction, since dev/test no longer relies on this cookie
    // crossing sites the same way. See this file's own top-of-file
    // comment for the full reasoning and the alternative (unifying
    // both services under one registrable domain), which remains the
    // more robust long-term fix.
    secure: true,
    sameSite: 'none',
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
    // DEPLOY-FIX-01: must match setRefreshTokenCookie's attributes above.
    secure: true,
    sameSite: 'none',
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
    // DEPLOY-FIX-01: must cross the same up.railway.app subdomain
    // boundary as refreshToken above, for the same reason — see that
    // cookie's comment.
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
  return csrfToken;
}

export function clearCsrfCookie(res: Response): void {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    // DEPLOY-FIX-01: must match setCsrfCookie's attributes above.
    secure: true,
    sameSite: 'none',
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
    // DEPLOY-FIX-01: must cross the same up.railway.app subdomain
    // boundary as refreshToken above, for the same reason — see that
    // cookie's comment. This one matters doubly: middleware.ts's Edge
    // Runtime check reads this cookie to avoid a false /login redirect
    // on a fresh page load, so it needs to actually arrive too.
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS, // same 7-day lifetime as refreshToken
  });
}

export function clearSessionHintCookie(res: Response): void {
  res.clearCookie(SESSION_HINT_COOKIE_NAME, {
    httpOnly: false,
    // DEPLOY-FIX-01: must match setSessionHintCookie's attributes above.
    secure: true,
    sameSite: 'none',
    path: '/',
  });
}

export function getSessionHintCookieName(): string {
  return SESSION_HINT_COOKIE_NAME;
}

/**
 * FIX M-004 — OAuth `state` CSRF protection.
 *
 * Previously /auth/google and /auth/google/callback used no `state`
 * parameter at all, running fully stateless (session: false, no
 * compensating check). That leaves the OAuth flow open to CSRF: an
 * attacker can start their own Google authorization flow, capture the
 * resulting callback URL (with their own valid `code`), and trick a
 * victim's browser into hitting that callback URL directly. Without a
 * `state` check, the callback handler has no way to tell "this
 * request completing the OAuth dance was actually initiated by this
 * same browser" from "an attacker is replaying/injecting a
 * dance they started" — the practical impact ranges from account
 * linking a victim's session to the attacker's Google identity, up to
 * session fixation, depending on exactly how the result is used.
 *
 * Fix follows the standard mitigation: generate a random, unguessable
 * `state` value when the flow starts, store it server-side-of-the-
 * browser in a short-lived httpOnly cookie (never exposed to the
 * redirect URL's query string as the only copy — Google echoes it
 * back in the callback query string too, and we compare the two),
 * and reject the callback outright if the cookie is missing or
 * doesn't match what Google echoed back. This is the same
 * "browser-scoped secret, compared server-side" shape as the
 * double-submit CSRF cookie above, just applied to the OAuth
 * handshake instead of same-origin state-changing requests.
 *
 * - httpOnly: true — never needs to be read by frontend JS; only this
 *   backend reads it back on the callback.
 * - maxAge: 10 minutes — the whole redirect-to-Google-and-back dance
 *   normally completes in seconds; this just bounds how long a stale,
 *   unused state cookie can linger if the user abandons the flow.
 * - path scoped to the OAuth endpoints only, mirroring the refresh
 *   token cookie's path scoping above.
 */
const OAUTH_STATE_COOKIE_NAME = 'oauth_state';
const OAUTH_STATE_COOKIE_PATH = '/api/v1/auth/google';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export function generateAndSetOAuthState(res: Response): string {
  const state = crypto.randomBytes(32).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: OAUTH_STATE_COOKIE_PATH,
    maxAge: OAUTH_STATE_MAX_AGE_MS,
  });
  return state;
}

export function getOAuthStateFromCookie(req: Request): string | undefined {
  return req.cookies?.[OAUTH_STATE_COOKIE_NAME];
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: OAUTH_STATE_COOKIE_PATH,
  });
}
