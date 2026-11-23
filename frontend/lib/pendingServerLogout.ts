/**
 * FIX WEB-PENDING-LOGOUT-01 — web parity with apps/mobile's pending-logout.
 *
 * THE PROBLEM
 * The refresh token and the `app_has_session` hint live in httpOnly cookies
 * that page JS can neither read nor delete. Logout therefore has exactly one
 * way to end the session for real: the server's POST /auth/logout answering
 * with Set-Cookie headers that clear them. useLogout/useLogoutAll clear the
 * LOCAL state in onSettled no matter what — correct for the UI — but when the
 * request itself fails (device offline, 5xx, timeout) the server session and
 * its cookies stay alive. The user sees a signed-out app; the next page load
 * finds the hint, AuthHydrationProvider calls /auth/refresh with the still
 * valid cookie, and the "logged out" account is silently signed back in. On a
 * shared device that hands the previous user's account to the next person —
 * and offline logouts are exactly the common case here.
 *
 * THE FIX
 * 1. Write-ahead marker: when the logout request fails, remember "this
 *    browser still owes the server a logout" (localStorage). No token is ever
 *    persisted — only the session id (a non-secret claim, used purely to tell
 *    sessions apart), the scope (this device / all devices) and a timestamp.
 * 2. While the marker exists, AuthHydrationProvider does NOT restore the
 *    session (it first tries to finish the logout instead).
 * 3. completePendingServerLogout() finishes the job with no backend change:
 *    refresh with the cookie (CSRF-exempt, returns a fresh access token +
 *    CSRF token), then call the normal /auth/logout (or /logout-all) with
 *    that pair. Mobile does the same refresh-then-logout fallback.
 *
 * WHY THE SESSION ID MATTERS
 * Between the failed logout and the retry the user may have signed in again
 * (Google sign-in is a full-page redirect that replaces the cookie). The
 * refreshed access token carries the session id of whatever the cookie holds
 * NOW; if it differs from the marker's, a newer, deliberate login owns the
 * cookie and must not be revoked → the marker is dropped ('superseded') and
 * the normal restore proceeds. If the original id could not be captured (no
 * in-memory token and no readable token cookie at logout time) the marker
 * stays unidentified and the retry revokes whatever the cookie holds: the
 * deliberate failure mode there is "sign out once too often", never "leave a
 * logged-out session resurrectable".
 *
 * Calls here deliberately use a bare axios instance, NOT apiClient: the
 * apiClient interceptors react to a 401 by toasting "session expired" and
 * hard-redirecting to /login, bind requests to the session cleanup version,
 * and read tokens from the auth store — all wrong for a background cleanup of
 * a session the app already considers over.
 */
import axios from 'axios';
import { API_BASE_URL } from '@/lib/constants';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browserStorage';
import { clearAuthCookies, deleteCookie } from '@/lib/cookies';
import { SESSION_HINT_MIRROR_COOKIE } from '@/lib/authSessionHint';
import { useAuthStore } from '@/store/auth.store';

export const PENDING_SERVER_LOGOUT_KEY = 'marketplat:pending-server-logout';

/**
 * Longer than any plausible refresh-cookie lifetime: once it passes, the
 * server session is dead on its own and the marker has nothing left to do.
 */
export const PENDING_SERVER_LOGOUT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CROSS_TAB_LOCK_NAME = 'marketplat-pending-server-logout';
const REFRESH_RACE_RETRY_DELAY_MS = 700;
const REQUEST_TIMEOUT_MS = 20_000;

export type PendingLogoutScope = 'one' | 'all';

export interface PendingServerLogout {
  v: 1;
  scope: PendingLogoutScope;
  /** Session the user asked to end; null when it could not be captured. */
  sessionId: string | null;
  at: number;
}

export type PendingLogoutOutcome =
  /** No marker (or it vanished) — nothing owed. */
  | 'none'
  /** Server revoked the session. Marker cleared. */
  | 'completed'
  /** Refresh was rejected (401/403): the session is already gone. Marker cleared. */
  | 'already-ended'
  /** A newer login owns the cookie; it was left alone. Marker cleared. */
  | 'superseded'
  /** Network/5xx/429/timeout: marker kept, try again later. */
  | 'retry-later'
  /** Another tab is finishing it right now. */
  | 'busy'
  /** Unrecoverable 4xx from logout: marker dropped to avoid retrying forever. */
  | 'gave-up';

// ── session id helpers ─────────────────────────────────────────────

/** Reads the `sessionId` claim from a JWT payload. No verification — an
 *  identity hint for comparing two tokens from the same server, never trust. */
export function sessionIdFromAccessToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(
      Array.from(atob(padded), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
    const payload = JSON.parse(json) as { sessionId?: unknown };
    return typeof payload.sessionId === 'string' && payload.sessionId ? payload.sessionId : null;
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      try {
        return decodeURIComponent(trimmed.slice(name.length + 1)) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Best-effort id of the session this browser is signed in with right now:
 * the in-memory access token first, then the JS-readable token cookie (which
 * survives a reload even when the in-memory token is empty, e.g. an offline
 * restored session). Call it BEFORE the local cleanup deletes either.
 */
export function getCurrentSessionIdHint(): string | null {
  return (
    sessionIdFromAccessToken(useAuthStore.getState().accessToken) ??
    sessionIdFromAccessToken(readCookie('app_access_token'))
  );
}

// ── marker storage ─────────────────────────────────────────────────

export function readPendingServerLogout(now: number = Date.now()): PendingServerLogout | null {
  const raw = safeStorageGet(PENDING_SERVER_LOGOUT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingServerLogout> | null;
    const valid =
      parsed &&
      parsed.v === 1 &&
      (parsed.scope === 'one' || parsed.scope === 'all') &&
      (parsed.sessionId === null || typeof parsed.sessionId === 'string') &&
      typeof parsed.at === 'number' &&
      Number.isFinite(parsed.at);
    if (!valid) {
      safeStorageRemove(PENDING_SERVER_LOGOUT_KEY);
      return null;
    }
    if (now - (parsed as PendingServerLogout).at > PENDING_SERVER_LOGOUT_TTL_MS) {
      safeStorageRemove(PENDING_SERVER_LOGOUT_KEY);
      return null;
    }
    return parsed as PendingServerLogout;
  } catch {
    safeStorageRemove(PENDING_SERVER_LOGOUT_KEY);
    return null;
  }
}

export function hasPendingServerLogout(): boolean {
  return readPendingServerLogout() !== null;
}

export function markPendingServerLogout(
  scope: PendingLogoutScope,
  sessionId: string | null,
  now: number = Date.now(),
): void {
  const existing = readPendingServerLogout(now);
  // Never downgrade: a pending "all devices" request must survive a later
  // plain logout failing too, and a captured session id must survive a later
  // attempt that could not capture one.
  const marker: PendingServerLogout = {
    v: 1,
    scope: existing?.scope === 'all' ? 'all' : scope,
    sessionId: sessionId ?? existing?.sessionId ?? null,
    at: now,
  };
  safeStorageSet(PENDING_SERVER_LOGOUT_KEY, JSON.stringify(marker));
}

export function clearPendingServerLogout(): void {
  safeStorageRemove(PENDING_SERVER_LOGOUT_KEY);
}

// ── completion ─────────────────────────────────────────────────────

function statusOf(err: unknown): number {
  if (axios.isAxiosError(err)) return err.response?.status ?? 0;
  if (err && typeof err === 'object') {
    const e = err as { response?: { status?: unknown }; statusCode?: unknown };
    if (typeof e.response?.status === 'number') return e.response.status;
    if (typeof e.statusCode === 'number') return e.statusCode;
  }
  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rawClient() {
  return axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    timeout: REQUEST_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface RefreshPair {
  accessToken: string;
  csrfToken: string | undefined;
}

/** Cookie-backed refresh. 'ended' = definitive 401/403, 'retry' = anything else. */
async function refreshOnce(
  client: ReturnType<typeof rawClient>,
): Promise<{ kind: 'ok'; pair: RefreshPair } | { kind: 'ended' } | { kind: 'retry' }> {
  try {
    const res = await client.post('/auth/refresh');
    const data = (res.data as { data?: { tokens?: { accessToken?: unknown }; csrfToken?: unknown } } | undefined)?.data;
    const accessToken = data?.tokens?.accessToken;
    if (typeof accessToken !== 'string' || !accessToken) return { kind: 'retry' };
    return {
      kind: 'ok',
      pair: { accessToken, csrfToken: typeof data?.csrfToken === 'string' ? data.csrfToken : undefined },
    };
  } catch (err) {
    const status = statusOf(err);
    return status === 401 || status === 403 ? { kind: 'ended' } : { kind: 'retry' };
  }
}

/** Local leftovers once the server session is known to be over. */
function clearLocalSessionHints(): void {
  clearAuthCookies();
  deleteCookie(SESSION_HINT_MIRROR_COOKIE);
}

async function runCompletion(): Promise<PendingLogoutOutcome> {
  const marker = readPendingServerLogout();
  if (!marker) return 'none';

  const client = rawClient();

  let refreshed = await refreshOnce(client);
  if (refreshed.kind === 'ended') {
    // A 401 can also be the loser of a refresh race (another tab / the
    // service worker rotated the cookie a moment earlier): retry once, the
    // same way AuthHydrationProvider does, before declaring the session dead.
    await sleep(REFRESH_RACE_RETRY_DELAY_MS);
    refreshed = await refreshOnce(client);
  }
  if (refreshed.kind === 'ended') {
    clearPendingServerLogout();
    clearLocalSessionHints();
    return 'already-ended';
  }
  if (refreshed.kind === 'retry') return 'retry-later';

  const { accessToken, csrfToken } = refreshed.pair;

  const currentSessionId = sessionIdFromAccessToken(accessToken);
  if (marker.sessionId && currentSessionId && marker.sessionId !== currentSessionId) {
    // A newer login replaced the cookie after the failed logout. Leave it be.
    clearPendingServerLogout();
    return 'superseded';
  }

  try {
    await client.post(
      marker.scope === 'all' ? '/auth/logout-all' : '/auth/logout',
      undefined,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
      },
    );
  } catch (err) {
    const status = statusOf(err);
    if (status === 401) {
      // The token we just got was already rejected: nothing live to revoke.
      clearPendingServerLogout();
      clearLocalSessionHints();
      return 'already-ended';
    }
    if (status === 0 || status === 408 || status === 429 || status >= 500) return 'retry-later';
    console.warn('[auth] pending logout rejected permanently; dropping marker', status);
    clearPendingServerLogout();
    return 'gave-up';
  }

  clearPendingServerLogout();
  clearLocalSessionHints();
  return 'completed';
}

let inFlight: Promise<PendingLogoutOutcome> | null = null;

/**
 * Finishes an owed server-side logout. Safe to call repeatedly and from
 * several tabs: calls in one tab share a promise, and across tabs the Web
 * Locks API (when present) lets only one run at a time.
 */
export function completePendingServerLogout(): Promise<PendingLogoutOutcome> {
  if (typeof window === 'undefined') return Promise.resolve('none');
  if (!hasPendingServerLogout()) return Promise.resolve('none');
  if (inFlight) return inFlight;

  const locks = (typeof navigator !== 'undefined'
    ? (navigator as Navigator & { locks?: LockManager }).locks
    : undefined);

  const run: () => Promise<PendingLogoutOutcome> = locks?.request
    ? () =>
        locks.request(
          CROSS_TAB_LOCK_NAME,
          { ifAvailable: true },
          async (lock) => (lock ? runCompletion() : ('busy' as PendingLogoutOutcome)),
        ) as Promise<PendingLogoutOutcome>
    : runCompletion;

  inFlight = run()
    .catch((err): PendingLogoutOutcome => {
      console.warn('[auth] pending logout attempt failed', err);
      return 'retry-later';
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Same as completePendingServerLogout but gives up WAITING after `ms` (the
 * attempt itself keeps running). Used at app start so a slow server can't
 * hold the whole app on the session spinner.
 */
export function completePendingServerLogoutWithin(ms: number): Promise<PendingLogoutOutcome> {
  return Promise.race([
    completePendingServerLogout(),
    new Promise<PendingLogoutOutcome>((resolve) => setTimeout(() => resolve('retry-later'), ms)),
  ]);
}
