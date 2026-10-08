'use client';

/**
 * lib/offlineWarmingState.ts
 *
 * Persistent state for the offline warming system. Lives in IndexedDB
 * because localStorage is too small (a full liveUrls list can exceed
 * 5 MB once every chunk is tracked) and because we need atomic
 * per-route updates without rewriting a whole JSON blob each time.
 *
 * Design notes:
 *  - ONE object store ('state') with ONE key ('current'). Warming is a
 *    single global concern; no need for multiple documents.
 *  - liveUrls is the canonical "what warming has successfully stored"
 *    list. Orphan sweep uses it as the source of truth: any
 *    /_next/static/* entry in STATIC_CACHE not present in liveUrls is
 *    considered an orphan and gets swept on the next successful
 *    warming pass.
 *  - routes map tracks per-route progress so a warming run that gets
 *    interrupted can resume. A route is 'complete' only when ALL its
 *    chunks have been verified present in STATIC_CACHE — never on
 *    partial success. This is the the old
 *    WARM-FALSE-SUCCESS-01 bug where a single stored file marked the
 *    whole run as successful.
 *  - lastSweepAt gates orphan sweep frequency — no reason to sweep
 *    more than once per hour even if warming runs many times.
 *
 * Storage quota: one snapshot is ~20-40 KB JSON. Negligible.
 */

const DB_NAME = 'marketplat-warming';
const DB_VERSION = 1;
const STORE = 'state';
const KEY = 'current';

/** A route's warming progress. */
export interface RouteWarmingMeta {
  status: 'pending' | 'complete' | 'failed';
  /** URLs warming stored for this route (HTML + chunks + RSC). */
  chunks: string[];
  attempts: number;
  /** Date.now() of the last attempt. */
  lastAttempt: number;
  /** Date.now() of the successful completion (only when status='complete'). */
  warmedAt?: number;
  /** Last error message, for diagnostics. Cleared on success. */
  lastError?: string;
}

export interface WarmingSnapshot {
  version: 1;
  /**
   * SW-WARM-CACHE-VERSION-01: which cache version this snapshot
   * describes. IndexedDB persists across SW updates, but the SW's
   * `activate` handler deletes every `market-*` cache whose version
   * suffix no longer matches CACHE_VERSION. Without this field, a
   * snapshot written under v37 said "every route is complete" while
   * the live v38 cache was empty — warming skipped every route, the
   * debug page reported all green, and every offline navigation hit
   * a cache miss. The snapshot describes WHICH cache it describes.
   */
  cacheVersion: string;
  /** All URLs warming has confirmed in STATIC_CACHE. */
  liveUrls: string[];
  /** Per-route state. Key = route path (e.g. '/products'). */
  routes: Record<string, RouteWarmingMeta>;
  /** Date.now() of the last orphan sweep. 0 = never. */
  lastSweepAt: number;
  /** Date.now() of the last write. */
  updatedAt: number;
}

// ── IndexedDB helpers ────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('idb open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result as T | undefined);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('idb tx aborted'));
  });
}

// ── Public API ───────────────────────────────────────────────────

function emptySnapshot(): WarmingSnapshot {
  return {
    version: 1,
    cacheVersion: '',
    liveUrls: [],
    routes: {},
    lastSweepAt: 0,
    updatedAt: Date.now(),
  };
}

/** Read the current snapshot, or null if none exists. Never throws. */
export async function readSnapshot(): Promise<WarmingSnapshot | null> {
  try {
    const snap = await idbGet<WarmingSnapshot>(KEY);
    if (!snap || snap.version !== 1) return null;
    return snap;
  } catch {
    return null;
  }
}

/**
 * SW-WARM-CACHE-VERSION-01: read the snapshot only if it describes the
 * currently-active cache version. A mismatch (deploy bumped
 * CACHE_VERSION) means the snapshot's "complete" routes refer to chunks
 * that no longer exist — we wipe it and return null so the caller
 * treats every route as fresh and re-warms. This is the the
 * "warming thinks everything is done, cache is empty" failure mode.
 */
export async function readSnapshotForCacheVersion(
  currentCacheVersion: string,
): Promise<WarmingSnapshot | null> {
  const snap = await readSnapshot();
  if (!snap) return null;
  if (snap.cacheVersion !== currentCacheVersion) {
    await clearSnapshot();
    // CACHE-VERSION-THROTTLE-RESET-01: the route/personal-warmed
    // localStorage keys are NOT part of the snapshot — they survive a
    // CACHE_VERSION bump. Without clearing them here, the next warming
    // pass sees 'warmed 5 minutes ago' (from the pre-bump pass), hits
    // the throttle, and returns without re-filling the fresh, empty
    // cache. Symptom: every page hits the /offline fallback for hours
    // after each deploy until a later freshness trigger eventually fires.
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Actual key shapes (see offlineRouteShells.ts's own constants):
        //   marketplat:route-shells:last-warmed:<version>
        //   marketplat:personal-shells:last-warmed:<version>
        //   marketplat:drip-last-pass:<version>
        //   marketplat:core-bundle:last-warmed:<version>  (offlineCoreBundle)
        // CORE-KEY-TYPO-was 'marketplat:core-last-warmed' —
        // the actual constant in offlineCoreBundle.ts is
        // 'marketplat:core-bundle:last-warmed'. The prefix never
        // matched, so core's stale marker was never cleaned up.
        // All prefixed with 'marketplat:' and versioned. Clearing any
        // stale-version entry is safe — the CACHE_VERSION just changed,
        // so the version-in-key already differs; this just stops the
        // old key from lingering in localStorage indefinitely.
        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const k = window.localStorage.key(i);
          if (k) keys.push(k);
        }
        for (const k of keys) {
          if (
            k.startsWith('marketplat:route-shells:last-warmed') ||
            k.startsWith('marketplat:personal-shells:last-warmed') ||
            k.startsWith('marketplat:core-bundle:last-warmed') ||
            k.startsWith('marketplat:drip-last-pass')
          ) {
            window.localStorage.removeItem(k);
          }
          // NOTE: never clear 'marketplat:warming-pref' here — that's the
          // user's own mode selection (off/fast/full), not warming state.
          // Clearing it on CACHE_VERSION bump would silently reset every
          // user's choice back to the default on every deploy.
        }
      }
    } catch {
      /* private mode / quota — harmless */
    }
    return null;
  }
  return snap;
}

/** Write a full snapshot. Throws on failure — caller decides what to do. */
export async function writeSnapshot(snap: WarmingSnapshot): Promise<void> {
  snap.updatedAt = Date.now();
  await idbPut(KEY, snap);
}

/**
 * Merge a route's status into the current snapshot. Creates the
 * snapshot if none exists. Never throws — warming failure is not a
 * reason to break the calling flow.
 */
// SW-WARM-CACHE-VERSION-WRITE-01: set by callers (offlineRouteShells)
// so every call records which cache version the
// snapshot describes. Module-scoped to avoid threading it through
// every call site.
let __activeCacheVersion = '';

export function setActiveCacheVersion(v: string): void {
  __activeCacheVersion = v;
}

export async function patchRouteStatus(
  route: string,
  meta: RouteWarmingMeta,
): Promise<void> {
  try {
    const snap = (await readSnapshot()) ?? emptySnapshot();
    snap.routes[route] = meta;
    if (__activeCacheVersion) snap.cacheVersion = __activeCacheVersion;
    await writeSnapshot(snap);
  } catch {
    // silent — persistence failures are non-fatal
  }
}

/** Replace liveUrls wholesale. Used at the end of a warming run. */
export async function recordLiveUrls(urls: string[]): Promise<void> {
  try {
    const snap = (await readSnapshot()) ?? emptySnapshot();
    // Deduplicate + sort for stable comparison across runs.
    snap.liveUrls = Array.from(new Set(urls)).sort();
    if (__activeCacheVersion) snap.cacheVersion = __activeCacheVersion;
    await writeSnapshot(snap);
  } catch {
    // silent
  }
}

/** Mark that an orphan sweep just ran. */
export async function recordSweepTime(): Promise<void> {
  try {
    const snap = (await readSnapshot()) ?? emptySnapshot();
    snap.lastSweepAt = Date.now();
    await writeSnapshot(snap);
  } catch {
    // silent
  }
}

/** Wipe all warming state. Called on logout / build change. */
export async function clearSnapshot(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silent
  }
}

// ── Session cleanup ──────────────────────────────────────────────

/**
 * SW-CLEAR-PERSONAL-WARMING-01: on logout, the SW wipes
 * PERSONAL_SHELL_CACHE but this IndexedDB snapshot survives. Without
 * clearing the 'personal:*' entries here, warming thinks every personal
 * route is already complete on the next login (from a different user,
 * or the same user re-logging), and skips them all — leaving the
 * personal shell cache empty right after login, exactly when offline
 * coverage matters most. Called from lib/authCleanup.ts.
 *
 * Deliberately keeps public routes and liveUrls: those describe the
 * shared STATIC_CACHE, which logout does not clear.
 */
export async function clearPersonalWarmingState(): Promise<void> {
  try {
    const snap = await readSnapshot();
    if (!snap) return;
    const kept: Record<string, RouteWarmingMeta> = {};
    for (const [key, meta] of Object.entries(snap.routes)) {
      if (!key.startsWith('personal:')) kept[key] = meta;
    }
    snap.routes = kept;
    await writeSnapshot(snap);
  } catch {
    // silent — logout cleanup is best-effort
  }
}

// ── Pure helpers ─────────────────────────────────────────────────

/**
 * Compare two URL lists and decide whether the build has changed enough
 * to warrant an orphan sweep. Uses Jaccard-style symmetric-difference
 * threshold: if more than 20% of URLs differ (and at least 5 differ
 * absolutely), the build is considered new. Small churn (one file
 * added/removed) doesn't trigger a full sweep.
 */
export function isBuildChanged(
  oldUrls: string[],
  newUrls: string[],
): boolean {
  if (oldUrls.length === 0 && newUrls.length === 0) return false;
  if (oldUrls.length === 0 || newUrls.length === 0) return true;

  const oldSet = new Set(oldUrls);
  const newSet = new Set(newUrls);
  let diff = 0;
  for (const u of oldSet) if (!newSet.has(u)) diff += 1;
  for (const u of newSet) if (!oldSet.has(u)) diff += 1;

  const maxLen = Math.max(oldUrls.length, newUrls.length);
  const ratio = diff / maxLen;
  return diff >= 5 && ratio >= 0.2;
}

/** Whether it's time to sweep again (once per hour is plenty). */
export function shouldSweep(lastSweepAt: number): boolean {
  const ONE_HOUR = 60 * 60 * 1000;
  return Date.now() - lastSweepAt > ONE_HOUR;
}

/**
 * Exponential backoff for a route's next attempt, capped at 30 minutes.
 * Used to avoid hammering a route that keeps failing on a bad network.
 */
export function backoffForAttempts(attempts: number): number {
  if (attempts <= 0) return 0;
  const base = 2_000; // 2s
  const cap = 30 * 60 * 1000; // 30min
  return Math.min(base * Math.pow(2, attempts - 1), cap);
}
