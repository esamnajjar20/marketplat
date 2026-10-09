/**
 * Next.js Proxy (formerly Middleware) — Edge Runtime.
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
 *   app_user_role      — 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN', mirrors Zustand store
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
import { getRawApiUrl } from './lib/env';

// ── Route classification ──────────────────────────────────────────

const PROTECTED_PREFIXES = [
  '/ads/create',
  '/dashboard',
  '/account',
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
  // BUGFIX: was missing — /my-store (app/(protected)/my-store/**) is the
  // stores-system sibling of /my-ads and /my-services and needs the same
  // Edge redirect for consistency (see audit report, issue #9).
  '/my-store',
  // BUGFIX: was missing — /my-requests (app/(protected)/my-requests/**)
  // is the customer-side counterpart of /my-services/requests and had
  // the exact same gap as the /my-services and /my-store fixes above.
  '/my-requests',
  // Open Requests: list+detail are public (like /ads). Only write/account paths gated.
  '/requests/new',
  '/requests/me',
  '/requests/offers',
  // AUDIT-FIX (issue #6): new /service-requests/[id] detail page —
  // protected the same way /my-requests and /my-services are, since it
  // shows the same customer/provider-only data as those list pages.
  '/service-requests',
  '/settings',
  // BUGFIX (audit #14): these 5 protected pages existed but were never
  // added to this list, same gap as /my-services, /my-store, and
  // /my-requests above — client-side guard still caught them, no auth
  // bypass, but they missed the Edge-level redirect.
  '/notifications',
  '/activity',
  '/saved-searches',
  '/my-reports',
  // FEAT-GOOGLE-COMPLETE-PROFILE: same Edge-redirect treatment as
  // every other (protected) route above — belt-and-suspenders with
  // that layout's own client-side guard.
  '/complete-profile',
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
// CACHE-CONTROL-01: Next.js 16 App Router sends
// `private, no-cache, no-store, max-age=0, must-revalidate` for every
// dynamic route. Because RootLayout reads headers() for the CSP nonce,
// every route is dynamic — so `no-store` was being applied to public
// browse pages too, forcing a full HTML fetch on every navigation. On
// Gaza's weak links that costs 30-50 KB per click with no 304
// revalidation.
//
// Override the header only for known PUBLIC routes so their HTML is
// cached (browser-only, private because of the nonce) and revalidated
// via ETag. Auth-gated and stateful routes keep the Next.js default
// and are never stored.
const PUBLIC_HTML_EXACT = new Set<string>([
  '/',
  '/about',
  '/privacy',
  '/contact',
  '/offline',
]);

const PUBLIC_HTML_PREFIXES = [
  '/ads/',
  '/products/',
  '/stores/',
  '/services/',
  '/service-providers/',
  '/requests/',
  '/search',
  '/sellers/',
  '/categories/',
];

function isPublicHtmlRoute(pathname: string): boolean {
  if (PUBLIC_HTML_EXACT.has(pathname)) return true;
  return PUBLIC_HTML_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function buildCsp(nonce: string, isDev: boolean): string {
  const apiOrigin = getRawApiUrl()?.trim() ?? '';
  return [
    "default-src 'self'",
    // FIX SEC-06: 'unsafe-inline' removed in production — replaced with
    // a per-request nonce. Browsers that understand `nonce-` ignore
    // 'unsafe-inline' when a nonce is present anyway, but we drop it
    // entirely outside dev so older-browser fallback behavior can't
    // silently widen the policy back open.
    // FIX OCR-01: cdn.jsdelivr.net مضاف لِـ script-src لأن قارئ نصوص بطاقات
    // النت (Tesseract.js — بطاقات نت بلا رمز QR أصلاً) يُحمَّل من هذا الـCDN
    // وقت التشغيل. 'wasm-unsafe-eval' ضروري لأن Tesseract.js ينفّذ WASM —
    // بدونه بعض المتصفحات ترفض تشغيل الكود حتى لو تحمّل بنجاح.
    // Google Sign-In widget loads its SDK from accounts.google.com (gsi/client)
    // and apis.google.com (legacy platform.js).
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://accounts.google.com https://apis.google.com${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ''}`,
    // FIX OFFLINE-01: fonts.googleapis.com/fonts.gstatic.com dropped —
    // fonts are now self-hosted via @fontsource (see app/layout.tsx)
    // and served from this app's own origin, not Google's CDN, so
    // there's nothing left that needs either host allow-listed.
    "style-src 'self' 'unsafe-inline'",
    // data: needed — icon fonts (Lucide, etc.) ship as base64 woff/woff2.
    "font-src 'self' data:",
    // FIX QR-CSP-CLEANUP-01: api.qrserver.com and quickchart.io removed.
    // They were allow-listed for QrCodeImage.tsx's <img> fallback path,
    // but that component had zero importers -- the only working QR image
    // was the local canvas render, which never touches the network. Every
    // external host kept in img-src is attack surface for any future code
    // that reaches an <img src>: leaving a public text-encoding endpoint
    // allow-listed (qrserver accepts arbitrary ?data=) means any later
    // component could exfiltrate through it without a CSP change being
    // noticed. QrCodeImage + its qrcode-generator vendor are deleted too.
    // img-src: Cloudinary (uploads) + placehold.co (placeholder fallback).
    "img-src 'self' data: blob: https://res.cloudinary.com https://placehold.co",
    // CHAT-VOICE: <audio src> uses media-src (NOT img-src, NOT connect-src).
    // Without an explicit media-src, the browser falls back to default-src
    // 'self' and silently blocks Cloudinary audio — voice notes render as
    // empty bubbles with no player and no error.
    "media-src 'self' blob: https://res.cloudinary.com",
    // FIX OCR-01: cdn.jsdelivr.net مضاف — Tesseract.js يجلب عبره ملفات
    // WASM وبيانات اللغة (eng.traineddata) بعد تحميل السكربت نفسه.
    // res.cloudinary.com is the delivery CDN; api.cloudinary.com is only
    // uploads. Both are needed — fetch() of an image goes to res.*.
    // Google Sign-In renders its button in an iframe from accounts.google.com.
    `frame-src https://accounts.google.com`,
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''} https://api.cloudinary.com https://res.cloudinary.com https://cdn.jsdelivr.net https://tessdata.projectnaptha.com https://accounts.google.com`,
    // FIX PWA-11: بدون worker-src صريح، بعض المتصفحات (خاصة القديمة أو
    // الصارمة) قد ترفض تسجيل public/sw.js حتى لو كان default-src 'self'
    // يسمح به نظريًا — worker-src ليس دائمًا يرث من default-src في كل
    // التطبيقات. manifest-src ضروري لتحميل /manifest.webmanifest (app/manifest.ts)
    // الذي يعتمد عليه اكتشاف قابلية التثبيت بالكامل.
    // FIX OCR-01: blob: و cdn.jsdelivr.net مضافين لأن Tesseract.js ينشئ
    // Web Worker من كود مُحمَّل من الـCDN (غالبًا عبر blob: URL داخليًا).
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

// ── Middleware ────────────────────────────────────────────────────

// FIX NEXT-16-PROXY: Next.js 16 deprecates the 'middleware' file
// convention in favor of 'proxy'. Both the filename and the
// exported function name change — the automatic codemod
// (npx @next/codemod middleware-to-proxy) does exactly this.
// Nothing about the function body changes; this is a rename.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // FIX CPU-LIMIT-01: /api/* skips CSP nonce + cookie decoding entirely.
  // Under Cloudflare Free tier's 10ms CPU/request, this saves ~6-7ms per
  // API call — the difference between 5 and 40 concurrent users. The
  // actual proxying happens in app/api/v1/[...path]/route.ts.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

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
  // Gap #20 (admin permission tiers): MODERATOR/SUPER_ADMIN added.
  const VALID_ROLES = ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const;
  const safeRole    = VALID_ROLES.includes(roleCookie as typeof VALID_ROLES[number])
    ? roleCookie
    : null;
  // SEC-05 hardening: app_user_role is a plain, JS-writable cookie — an
  // attacker can set it to "ADMIN" from the console regardless of who
  // they actually are. When the access token itself carries a role
  // claim, it must agree with the cookie before an admin-tier role is
  // trusted; a valid-but-non-admin token paired with a forged
  // admin-tier cookie no longer passes. Tokens with no role claim
  // (older tokens issued before the backend added it) keep the prior
  // cookie-only behavior.
  const tokenRole    = decoded?.role ?? null;
  // Gap #20: this gate now means "any admin-tier role" (MODERATOR and
  // above) — it only decides whether /admin/* pages are allowed to
  // load at all. Which specific pages/actions a MODERATOR can reach
  // within /admin/* is narrowed client-side (AdminSidebar) and
  // enforced for real by the backend (requireMinRole) — this
  // middleware remains routing convenience only, not the security
  // boundary (see the file-level note above).
  const ADMIN_TIER_ROLES = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const;
  const isAdminTierRole  = (role: string | null): boolean =>
    role !== null && (ADMIN_TIER_ROLES as readonly string[]).includes(role);
  const isAdmin = isAdminTierRole(safeRole) && (tokenRole === null || isAdminTierRole(tokenRole));

  // 1. Redirect away from auth pages only when we have a *valid access
  // token* — not merely app_has_session. Session-hint alone means
  // "maybe still logged in; let AuthHydrationProvider confirm". If the
  // client failed to restore (refresh 401/timeout) while the hint cookie
  // is still set, treating hint as fully logged-in caused a loop:
  //   /login → middleware → /dashboard → !isAuthenticated → "جاري التحقق"
  //   → redirect /login → … and the user could never reach login/register.
  // FIX AUTH-LOGIN-LOOP-01: only skip auth pages when access token is valid.
  if (isAuthPage(pathname) && hasValidAccessToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 2. Protect authenticated routes.
  if (isProtected(pathname) && !isLoggedIn) {
    const url = new URL('/login', request.url);
    // ROUTE-FIX-01: keep the query string so hub tabs (/my-store?tab=…)
    // survive the login round-trip.
    url.searchParams.set('from', pathname + search);
    return NextResponse.redirect(url);
  }

  // 3. Protect admin routes.
  if (isAdminRoute(pathname)) {
    if (!isLoggedIn) {
      const url = new URL('/login', request.url);
      url.searchParams.set('from', pathname + search);
      return NextResponse.redirect(url);
    }
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // FIX SEC-06: per-request nonce for CSP script-src, replacing the
  // static 'unsafe-inline' that previously applied even in production.
  // DEPLOYMENT-NONCE-01: same nonce across all requests within one
  // deployment so cached HTML matches the CSP header. A per-request nonce
  // breaks when Cloudflare (or any CDN) caches the HTML: the cached copy
  // retains the old nonce while the CSP header carries a fresh one, and
  // the browser then blocks the RSC streaming scripts ($RC) — which is
  // exactly the trigger for React #418 args[]=HTML. The nonce need not be
  // secret (it proves script origin, not caller identity), so a
  // build-time constant is safe. It rotates on every deploy.
  const deploymentSeed =
    process.env.NEXT_PUBLIC_BUILD_NONCE ??
    process.env.CF_VERSION_METADATA_ID ??
    process.env.GITHUB_SHA ??
    null;
  const nonce = deploymentSeed
    ? deploymentSeed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32).padEnd(32, '0')
    : crypto.randomUUID().replace(/-/g, '');
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

  // CACHE-CONTROL-01: override the Next.js default `no-store` for public
  // HTML routes so browsers keep a copy and revalidate via ETag (304).
  // Nonce is deployment-scoped (DEPLOYMENT-NONCE-01), so the HTML body
  // is stable within a deployment.
  if (isPublicHtmlRoute(request.nextUrl.pathname)) {
    response.headers.set('Cache-Control', 'private, no-cache');
  }

  return response;
}

// FIX MIDDLEWARE-01: Refined matcher to skip Next.js internals and common
// static file extensions, reducing unnecessary middleware invocations.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/data|_next/webpack|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|css|js|json|map)).*)',
  ],
};
