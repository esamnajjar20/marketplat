import { reportBackgroundFailure } from './backgroundTask';
/**
 * lib/offlineWarmingCoordinator.ts
 *
 * Ensures only ONE tab at a time runs the warming pass. Without this,
 * a user who opens three tabs (which happens constantly on a phone
 * when links open in new tabs) fires three parallel warming runs —
 * three times the bandwidth, three times the battery, and on a slow
 * link the three runs contend with each other and none of them
 * finishes in reasonable time.
 *
 * Two mechanisms, in order of preference:
 *
 *   1. Web Locks API (navigator.locks). Standard, available in all
 *      Chromium-based browsers and Safari 15.4+. Provides a proper
 *      cross-tab lock with automatic release on tab close (crucial —
 *      a tab that gets killed mid-warming does NOT leave a stale lock
 *      behind, unlike a hand-rolled localStorage mutex).
 *
 *   2. Fallback localStorage mutex. For browsers without Web Locks.
 *      Uses a lock key with an expiry timestamp; a lock older than
 *      LOCK_TTL_MS is considered stale and can be stolen. This is not
 *      perfectly atomic (two tabs could race in the same millisecond
 *      in theory), but the practical impact of a rare double-run is
 *      a few wasted requests, not data corruption. Acceptable.
 *
 * If BOTH mechanisms are unavailable, warming proceeds without
 * coordination. This is strictly worse (potential double-run) but
 * never breaks — warming is a background optimization, not a critical
 * path.
 *
 * Usage:
 *
 *   const release = await acquireWarmingLock();
 *   if (!release) return; // another tab holds it
 *   try {
 *     await doWarming();
 *   } finally {
 *     await release();
 *   }
 */
'use client';

const LOCK_NAME = 'marketplat-warming';
const FALLBACK_KEY = 'marketplat-warming-lock';
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes — generous upper bound

interface LockLike {
  name: string;
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode?: 'exclusive' | 'shared'; ifAvailable?: boolean },
    callback: (lock: LockLike | null) => Promise<T> | T,
  ): Promise<T>;
}

function getLockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { locks?: LockManagerLike };
  return nav.locks ?? null;
}

// ── Fallback (localStorage) ──────────────────────────────────────

// PHASE-2: the fallback key is derived from the logical lock name so
// that public warming and personal warming can hold independent locks
// on the same device, mirroring the Web Locks path.
function fallbackKeyFor(lockName: string): string {
  return `${FALLBACK_KEY}:${lockName}`;
}

function readFallbackLock(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

function writeFallbackLock(key: string, ts: number): void {
  try {
    localStorage.setItem(key, String(ts));
  } catch {
    // localStorage may be unavailable (Safari Private, quota, etc.)
    // — in that case the fallback lock simply never engages and
    // warming runs uncoordinated. Acceptable degradation.
  }
}

function clearFallbackLock(key: string, ts: number): void {
  try {
    // Only clear if we still own it (someone else may have stolen it
    // after our TTL expired).
    if (readFallbackLock(key) === ts) {
      localStorage.removeItem(key);
    }
  } catch {
    // silent
  }
}

async function acquireFallbackLock(
  lockName: string,
): Promise<(() => Promise<void>) | null> {
  const key = fallbackKeyFor(lockName);
  const now = Date.now();
  const held = readFallbackLock(key);

  if (held > 0 && now - held < LOCK_TTL_MS) {
    return null; // someone else holds a fresh lock
  }

  // Take (or steal a stale) lock.
  writeFallbackLock(key, now);

  // Verify we actually own it — someone might have raced us. This is
  // best-effort; the read-back may still see our own value if the
  // other writer wrote first and we overwrote them. In practice the
  // window is a few milliseconds and the consequence is a harmless
  // double-run.
  if (readFallbackLock(key) !== now) {
    return null;
  }

  return async () => {
    clearFallbackLock(key, now);
  };
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Try to acquire the warming lock.
 *
 * Returns a release function on success, or null if another tab holds
 * the lock. The release function is idempotent — calling it twice is
 * harmless.
 *
 * IMPORTANT: the caller MUST call release() in a finally block. The
 * Web Locks API would auto-release on tab close, but the fallback
 * does not, so a leaked lock in the fallback path would block warming
 * for LOCK_TTL_MS.
 */
export async function acquireWarmingLock(
  lockName: string = LOCK_NAME,
): Promise<(() => Promise<void>) | null> {
  const lm = getLockManager();

  if (lm) {
    // Web Locks path — ifAvailable means "do not wait, fail fast if
    // another holder exists". We never want warming to queue behind
    // another tab's warming run.
    //
    // SW-WEBLOCKS-DEADLOCK-01: DO NOT `await lm.request(...)` here. The
    // callback holds the lock until releaseFn is called, so the request
    // promise only resolves after the caller finishes its work. Awaiting
    // it here would deadlock: we'd never return the release function,
    // the callback's inner promise would never resolve, and the request
    // promise would never settle. Warming hung silently on the very
    // first call. Instead: fire the request, wait for the callback to
    // signal it entered (via a dedicated `entered` promise), then
    // return the release function.
    let resolveEntered!: () => void;
    const entered = new Promise<void>((r) => {
      resolveEntered = r;
    });
    let releaseFn: (() => void) | null = null;
    let lockAvailable = false;

    const requestPromise = lm.request(
      lockName,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (!lock) {
          // Another tab holds the lock. Signal and return.
          resolveEntered();
          return;
        }
        lockAvailable = true;
        resolveEntered();
        await new Promise<void>((resolve) => {
          releaseFn = resolve;
        });
      },
    );
    // Swallow rejections on this floating promise — the caller never
    // sees them, and an unhandled rejection would show up in the
    // console as noise.
    requestPromise.catch((error) => reportBackgroundFailure('frontend/lib/offlineWarmingCoordinator.ts', error));

    await entered;
    if (!lockAvailable) return null;

    let released = false;
    return async () => {
      if (released) return;
      released = true;
      releaseFn?.();
      try {
        await requestPromise;
      } catch {
        // silent
      }
    };
  }

  // Fallback path.
  return acquireFallbackLock(lockName);
}

/**
 * Convenience wrapper: runs `fn` under the warming lock if acquired,
 * no-ops otherwise. Returns whether `fn` actually ran.
 *
 * Use this when you don't need fine-grained control over the lock
 * lifecycle — which is the common case for warming entry points.
 */
export async function runUnderWarmingLock(
  fn: () => Promise<void>,
  lockName: string = LOCK_NAME,
): Promise<boolean> {
  const release = await acquireWarmingLock(lockName);
  if (!release) return false;
  try {
    await fn();
    return true;
  } finally {
    await release();
  }
}

/**
 * Debug helper — returns which coordination mechanism will be used.
 * Used by the (future) ?debug=warming overlay.
 */
export function describeCoordination(): 'web-locks' | 'localstorage' | 'none' {
  if (getLockManager()) return 'web-locks';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('__probe', '1');
      localStorage.removeItem('__probe');
      return 'localstorage';
    }
  } catch {
    // fall through
  }
  return 'none';
}
