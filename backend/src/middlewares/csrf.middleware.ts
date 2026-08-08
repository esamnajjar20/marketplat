import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { getCsrfCookieName } from "../shared/utils/authCookies";
import { ForbiddenError } from "../shared/errors/ForbiddenError";

// AUDIT-FIX M-03 (defense-in-depth alongside metrics.ts): plain
// `!==` string comparison is not constant-time. Real-world risk here
// is low (CSRF tokens are single-use-per-session, not long-lived
// secrets like the metrics bearer token), but hardening is a one-line
// change with no behavior difference on the happy path.
function safeTokenEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * PROD-FIX-15: CSRF protection, made necessary by moving refreshToken
 * into an httpOnly cookie (see shared/utils/authCookies.ts's header
 * comment for the full reasoning — a cookie the browser sends
 * automatically closes an XSS-token-theft gap but opens a CSRF gap
 * that a bearer-token-only scheme never had).
 *
 * Double-submit cookie pattern: setCsrfCookie() (authCookies.ts) sets
 * a random token in a *non*-httpOnly cookie on login/register/refresh
 * — readable by same-origin JS, sent automatically by the browser like
 * any cookie. The frontend reads that cookie's value and echoes it
 * back in the `X-CSRF-Token` header on every state-changing request.
 * This middleware checks the two match.
 *
 * Why this actually stops CSRF: a malicious cross-site page CAN cause
 * the victim's browser to send a request with the CSRF cookie
 * attached (that's the "cross-site request forgery" part — cookies
 * ride along automatically). What it CANNOT do is read the cookie's
 * VALUE (browsers enforce same-origin restrictions on cookie access
 * via JS) to also set a matching X-CSRF-Token header. No header, or a
 * wrong one, means the two values won't match, and the request is
 * rejected — regardless of whether the refreshToken cookie itself
 * would otherwise have been valid.
 *
 * CRITICAL scoping decision — only enforced when a csrfToken cookie is
 * actually PRESENT on the request. CSRF as an attack class only exists
 * because browsers attach cookies to requests automatically and
 * without the originating page's involvement; a request authenticated
 * purely via an `Authorization: Bearer <token>` header (no cookies
 * involved at all — every non-browser API client, and every browser
 * client that hasn't gone through the cookie-issuing login/refresh
 * flow) cannot be forged this way in the first place, since a
 * cross-site page has no mechanism to make the victim's browser send a
 * custom header on its behalf. Enforcing this unconditionally would
 * incorrectly reject every legitimate Bearer-token-only request (API
 * integrations, and this repo's own existing integration test suite,
 * none of which sends a csrfToken cookie) that never opted into
 * cookie-based auth at all.
 *
 * Only applied to state-changing methods (POST/PUT/PATCH/DELETE) —
 * GET/HEAD/OPTIONS are exempt, matching every standard CSRF-protection
 * guide's recommendation (safe methods should never mutate state in
 * the first place, so there's nothing for CSRF to forge there).
 *
 * login/register are ALSO exempt: those are the endpoints that ISSUE
 * the CSRF cookie in the first place — requiring a still-nonexistent
 * token to obtain the token would be a bootstrapping deadlock. This is
 * safe specifically because login/register don't rely on an existing
 * authenticated session/cookie to do anything sensitive — they're
 * "prove who you are from scratch" endpoints where the meaningful
 * secret being checked is the password, not a pre-existing cookie.
 * (This mirrors how most real-world CSRF middleware — Django, Rails —
 * also exempts the login endpoint itself.)
 */
const CSRF_EXEMPT_PATHS = new Set(["/auth/login", "/auth/register"]);

export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const isSafeMethod = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (isSafeMethod || CSRF_EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[getCsrfCookieName()];

  // No CSRF cookie on this request at all -> this client never went
  // through the cookie-issuing login/register/refresh flow, so it's
  // a pure Bearer-token client (or hasn't authenticated at all, in
  // which case `authenticate` will reject it separately anyway) —
  // not something CSRF can forge. Nothing to check here.
  if (cookieToken === undefined) {
    next();
    return;
  }

  const headerToken = req.headers["x-csrf-token"];

  if (
    typeof cookieToken !== "string" ||
    typeof headerToken !== "string" ||
    cookieToken.length === 0 ||
    !safeTokenEquals(cookieToken, headerToken)
  ) {
    next(new ForbiddenError("Invalid or missing CSRF token"));
    return;
  }

  next();
}
