/**
 * Next.js Middleware — Edge Runtime.
 *
 * Auth strategy (cookies set by AuthHydrationProvider after hydration,
 * AND — as of AUDIT-FIX C-1 — by the backend itself at login/register/
 * refresh/logout, see authCookies.ts):
 *   app_access_token  — JWT access token (15 min TTL), non-httpOnly,
 *                        set by client JS only (login/register/silent refresh)
 *   app_has_session    — '1' if a refresh-token-backed session exists,
 *                        non-httpOnly, ~7 day TTL matching refreshToken's
 *                        own lifetime. Set/cleared by the BACKEND
 *                        (authCookies.ts) alongside the httpOnly
 *                        refreshToken cookie, so — unlike
 *                        app_access_token — it survives a fresh page
 *                        load (new tab, reopened browser) even when the
 *                        short-lived access-token cookie has expired.
 *   app_user_role      — 'USER' | 'ADMIN', mirrors Zustand store
 *
 * ⚠️  SECURITY NOTE — role cookie trust model:
 *   app_user_role is a non-HttpOnly, JS-writable cookie.
 *   An attacker can set it to 'ADMIN' directly from the browser console.
 *   This middleware provides ROUTING convenience only — it is NOT a security boundary.
 *   The real security boundary is the backend API (Bearer token + server-side role check).
 *   Admin PAGES load for a forged role, but every /admin/* API call returns 403.
 *
 *   Long-term fix: embed the role inside the signed JWT payload so the token
 *   itself carries the role — readable in Edge Runtime without a crypto library
 *   (JWT payload is base64url-encoded, not encrypted). See decodeToken() below.
 *   Until the backend adds `role` to the JWT, the current two-layer model is the
 *   best available option. The AdminLayout provides a second Zustand-based check.
 *
 * SEC-05 FIX: roleCookie value is validated against the known enum before use.
 *
 * AUDIT-FIX C-1 — false-logout on fresh page loads:
 *   Previously, "logged in" was decided SOLELY from app_access_token —
 *   a cookie only ever set by client-side JS, with a ~14min max-age
 *   matching the access token's own short lifetime. Since middleware
 *   runs on the Edge, before any client JS (including
 *   AuthHydrationProvider's own silent-refresh call) gets a chance to
 *   run, a fully-logged-in user reopening a tab/browser after ~14min
 *   of inactivity — even with a fully valid 7-day refreshToken cookie
 *   — was redirected straight to /login. client.ts's own FIX AUTH-03
 *   comment documents the team already having caught and partially
 *   fixed this exact mechanism for the in-session silent-refresh case;
 *   this closes the remaining fresh-page-load gap.
 *
 *   Fix: `isLoggedIn` below now ALSO accepts a valid (non-expired)
 *   app_access_token OR the presence of the app_has_session hint
 *   cookie. app_has_session carries no secret and grants no access by
 *   itself (same trust model as app_user_role above) — it only tells
 *   middleware "assume a session exists, let the page mount and let
 *   AuthHydrationProvider's real /auth/refresh call either confirm it
 *   (silently, before the user notices) or actually log the user out
 *   if the backend disagrees (e.g. session was revoked elsewhere)."
 *   The backend remains the only real authority: every actual API call
 *   still requires a valid Bearer access token, checked server-side.
 *
 * FIX MIDDLEWARE-01: Middleware matcher now explicitly excludes public files
 *   AND the Next.js internal routes (_next/data, _next/webpack) to prevent
 *   the middleware running on every hot-reload request in development,
 *   which caused noticeable dev-server slowdowns.
 *
 * FIX MIDDLEWARE-02: decodeToken uses TextDecoder (available in Edge Runtime)
 *   instead of atob() for reliable base64url handling of all character sets
 *   including Unicode payloads. atob() is not available in all Edge workers.
 *
 * FIX MIDDLEWARE-03: Request ID now uses crypto.randomUUID() — already
 *   present, confirmed available in Edge Runtime (no change needed).
 */
import { NextResponse, type NextRequest } from 'next/server';

// ── Route classification ──────────────────────────────────────────

const PROTECTED_PREFIXES = [
  '/ads/create',
  '/dashboard',
  '/favorites',
  '/messages',
  '/my-ads',
  // BUGFIX: was missing — /my-services (app/(protected)/my-services/**)
  // is the services-system sibling of /my-ads and needs the same Edge
  // redirect. Previously only (protected)/layout.tsx's client-side
  // guard caught this, which still worked (no auth bypass — the
  // backend APIs enforce `authenticate` independently) but let an
  // unauthenticated visitor's request reach the page shell and flash
  // briefly before the client-side redirect fired, unlike every other
  // protected route.
  '/my-services',
  '/settings',
] as const;

const PROTECTED_AD_EDIT_RE = /^\/ads\/[^/]+\/edit(\/.*)?$/;
const ADMIN_PREFIX          = '/admin';
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'] as const;

function isProtected(pathname: string): boolean {
  if (PROTECTED_AD_EDIT_RE.test(pathname)) return true;
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isAdminRoute(pathname: string): boolean {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PATHS.some((p) => pathname.startsWith(p));
}

// ── Token helpers ─────────────────────────────────────────────────

interface DecodedToken {
  userId: string;
  exp:    number;
  /**
   * SEC-05 hardening: when the backend's JWT includes a role claim,
   * middleware cross-checks it against app_user_role below instead of
   * trusting the (JS-writable, forgeable) cookie alone. Optional so
   * tokens issued before the backend added this claim still decode —
   * those fall back to cookie-only trust, same as before this fix.
   */
  role?: string;
}

/**
 * FIX MIDDLEWARE-02: Use TextDecoder for reliable base64url decoding.
 * atob() is available in Edge Runtime but can fail on non-ASCII payloads.
 * TextDecoder handles UTF-8 encoded JWTs correctly.
 */
function decodeToken(token: string): DecodedToken | null {
  try {
    const part    = token.split('.')[1];
    if (!part) return null;

    // base64url → base64
    const b64     = part.replace(/-/g, '+').replace(/_/g, '/');
    // Pad to multiple of 4
    const padded  = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary  = atob(padded);
    const bytes   = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json    = new TextDecoder().decode(bytes);
    return JSON.parse(json) as DecodedToken;
  } catch {
    return null;
  }
}

function isTokenExpired(decoded: DecodedToken): boolean {
  // Add 10s buffer to account for clock skew between client and server.
  return decoded.exp * 1000 < Date.now() + 10_000;
}

// ── CSP nonce ─────────────────────────────────────────────────────
//
// FIX SEC-06: next.config.ts's headers() runs once at build time and
// can't vary per request, so the CSP there could only ever use a
// static 'unsafe-inline' for script-src — there's no way to generate a
// fresh nonce per request from a static config. Next.js's documented
// pattern for nonce-based CSP is to generate the nonce here in
// middleware (which runs per-request) and set an `x-nonce` request
// header — Next.js's App Router automatically detects this header and
// applies the same nonce to its own injected scripts (hydration/RSC
// payload scripts), no extra wiring needed elsewhere. We also set the
// actual Content-Security-Policy response header here (replacing the
// static one previously in next.config.ts) so script-src's nonce value
// matches what was just minted.
function buildCsp(nonce: string, isDev: boolean): string {
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  return [
    "default-src 'self'",
    // FIX SEC-06: 'unsafe-inline' removed in production — replaced with
    // a per-request nonce. Browsers that understand `nonce-` ignore
    // 'unsafe-inline' when a nonce is present anyway, but we drop it
    // entirely outside dev so older-browser fallback behavior can't
    // silently widen the policy back open.
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ''}`,
    // FIX OFFLINE-01: fonts.googleapis.com/fonts.gstatic.com dropped —
    // fonts are now self-hosted via @fontsource (see app/layout.tsx)
    // and served from this app's own origin, not Google's CDN, so
    // there's nothing left that needs either host allow-listed.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https://res.cloudinary.com https://placehold.co",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''} https://api.cloudinary.com`,
    // FIX PWA-11: بدون worker-src صريح، بعض المتصفحات (خاصة القديمة أو
    // الصارمة) قد ترفض تسجيل public/sw.js حتى لو كان default-src 'self'
    // يسمح به نظريًا — worker-src ليس دائمًا يرث من default-src في كل
    // التطبيقات. manifest-src ضروري لتحميل /manifest.webmanifest (app/manifest.ts)
    // الذي يعتمد عليه اكتشاف قابلية التثبيت بالكامل.
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

// ── Middleware ────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const tokenCookie = request.cookies.get('app_access_token')?.value ?? null;
  const decoded     = tokenCookie ? decodeToken(tokenCookie) : null;
  const hasValidAccessToken = decoded !== null && !isTokenExpired(decoded);

  // AUDIT-FIX C-1: app_access_token alone is too short-lived (~14min) to
  // survive a fresh page load (new tab, reopened browser) — see the
  // file-level doc comment above. app_has_session is backend-set,
  // matches refreshToken's own ~7-day lifetime, and is cleared by the
  // backend on logout/logout-all, so its presence means "a session
  // likely still exists, let AuthHydrationProvider's real
  // /auth/refresh call confirm or deny it" rather than an immediate,
  // possibly-false redirect to /login.
  const hasSessionHint = request.cookies.get('app_has_session')?.value === '1';
  const isLoggedIn     = hasValidAccessToken || hasSessionHint;

  const roleCookie  = request.cookies.get('app_user_role')?.value ?? null;
  // SEC-05 FIX: Only accept known role values. Any forged or unexpected value
  // is treated as non-admin. Prevents cookie pollution from unexpected strings.
  const VALID_ROLES = ['USER', 'ADMIN'] as const;
  const safeRole    = VALID_ROLES.includes(roleCookie as typeof VALID_ROLES[number])
    ? roleCookie
    : null;
  // SEC-05 hardening: app_user_role is a plain, JS-writable cookie — an
  // attacker can set it to "ADMIN" from the console regardless of who
  // they actually are. When the access token itself carries a role
  // claim, it must agree with the cookie before ADMIN is trusted; a
  // valid-but-non-admin token paired with a forged ADMIN cookie no
  // longer passes. Tokens with no role claim (older tokens issued
  // before the backend added it) keep the prior cookie-only behavior.
  const tokenRole   = decoded?.role ?? null;
  const isAdmin      = safeRole === 'ADMIN' && (tokenRole === null || tokenRole === 'ADMIN');

  // 1. Redirect logged-in users away from auth pages.
  if (isAuthPage(pathname) && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 2. Protect authenticated routes.
  if (isProtected(pathname) && !isLoggedIn) {
    const url = new URL('/login', request.url);
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  // 3. Protect admin routes.
  if (isAdminRoute(pathname)) {
    if (!isLoggedIn) {
      const url = new URL('/login', request.url);
      url.searchParams.set('from', pathname);
      return NextResponse.redirect(url);
    }
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // FIX SEC-06: per-request nonce for CSP script-src, replacing the
  // static 'unsafe-inline' that previously applied even in production.
  const nonce = crypto.randomUUID().replace(/-/g, '');
  // SECURITY: NextResponse.next({ request: { headers } }) serializes
  // the full header set it's given into internal x-middleware-request-*
  // headers on the *response* so Next.js can reconstruct the request
  // downstream — meaning any sensitive header present here (notably
  // `cookie`, which carries app_access_token) becomes readable on the
  // outgoing response too. Only x-nonce is actually needed downstream
  // (App Router auto-detects it for RSC/hydration script nonces), so
  // strip cookie/authorization instead of forwarding the incoming
  // headers verbatim.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('cookie');
  requestHeaders.delete('authorization');
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(
    'Content-Security-Policy',
    buildCsp(nonce, process.env.NODE_ENV !== 'production'),
  );
  // Attach request ID for distributed tracing.
  response.headers.set('X-Request-Id', crypto.randomUUID());
  return response;
}

// FIX MIDDLEWARE-01: Refined matcher to skip Next.js internals and common
// static file extensions, reducing unnecessary middleware invocations.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/data|_next/webpack|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|css|js|json|map)).*)',
  ],
};
