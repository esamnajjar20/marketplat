import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { guardedCache } from '../../shared/utils/cacheGuard';
import { homeService, isHomepageDegraded, type HomepageResult } from './home.service';
import type { GetHomepageQuery } from './home.validation';
import { homeCacheKeyForCity } from './home.cache.keys';

/**
 * Stale-while-revalidate cache for the assembled GET /home payload.
 *
 * Why: /home is public and identical for every viewer, but each miss runs
 * 11+ queries (stores, products, services and providers have no cache of
 * their own — only ads and categories do). The payload only varies by the
 * allow-listed `city` (≤ 11 distinct keys).
 *
 * FIX HOME-CACHE-SWR-01: the entry used to be a plain 30-40s TTL key, so once
 * it expired the *first visitor of every window paid the 11-query assembly*,
 * and the boot-time warmup (which runs once) was gone within a minute. Now the
 * value is stored with a long hard TTL plus a `softExpiresAt` inside an
 * envelope:
 *  - before softExpiresAt  → serve as-is.
 *  - after softExpiresAt   → serve the stale payload immediately and refresh in
 *    the background (one refresher across ALL processes, via a Redis
 *    SET NX PX lock; with PM2 cluster mode every worker used to rebuild).
 *  - no entry at all       → build synchronously (per-process singleflight).
 * Invalidation (home.cache.keys.ts → invalidateHomeCache) deletes the keys, so
 * an urgent takedown takes the synchronous path and is never served stale.
 *
 * - Only complete (non-degraded) payloads are cached, so a partial failure
 *   heals on the next request instead of being pinned.
 * - Redis being slow/down is never fatal: cache calls are time-boxed and
 *   circuit-broken (cacheGuard.ts) and fall through to the service.
 */
export const HOME_CACHE_TTL_SECONDS = 30; // soft TTL: after this the entry is "stale"
// FIX HOME-CACHE-JITTER-01: all ≤11 city keys used to expire in lockstep
// (fixed TTL, written by the same first requests), so the 11+ query
// assembly for every city re-ran at the same instant each window.
// 0..HOME_CACHE_TTL_JITTER_SECONDS extra seconds spreads them out.
export const HOME_CACHE_TTL_JITTER_SECONDS = 10;
/** How long a stale entry may still be served while a refresh is pending/failing. */
export const HOME_CACHE_HARD_TTL_SECONDS = 600;
/** Upper bound for one background rebuild; the lock simply expires after this. */
export const HOME_REFRESH_LOCK_TTL_MS = 15_000;

const ttlWithJitter = (): number =>
  HOME_CACHE_TTL_SECONDS + Math.floor(Math.random() * (HOME_CACHE_TTL_JITTER_SECONDS + 1));

interface HomeCacheEnvelope {
  softExpiresAt: number; // epoch ms
  payload: HomepageResult;
}

const inflight = new Map<string, Promise<HomepageResult>>();

export const homeCacheKey = (query: GetHomepageQuery): string => homeCacheKeyForCity(query.city);

async function readCache(key: string): Promise<HomeCacheEnvelope | null> {
  try {
    const raw = await guardedCache(() => redis.get(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HomeCacheEnvelope>;
    if (typeof parsed?.softExpiresAt !== 'number' || !parsed.payload) return null;
    return parsed as HomeCacheEnvelope;
  } catch (error) {
    logger.warn('[home] cache read failed, falling back to DB', error);
    return null;
  }
}

async function writeCache(key: string, payload: HomepageResult): Promise<void> {
  try {
    const envelope: HomeCacheEnvelope = {
      softExpiresAt: Date.now() + ttlWithJitter() * 1000,
      payload,
    };
    await guardedCache(() =>
      redis.set(key, JSON.stringify(envelope), 'EX', HOME_CACHE_HARD_TTL_SECONDS),
    );
  } catch (error) {
    logger.warn('[home] cache write failed', error);
  }
}

/**
 * Cross-process "I am the one refreshing this key" lock. Released by expiry
 * (PX), not by DEL: the soft TTL (≥30s) is longer than the lock, so the
 * lock never blocks the *next* refresh window, and there is no release
 * race to get wrong. If Redis errors we fail open — the per-process
 * `inflight` map still stops a local stampede.
 */
async function acquireRefreshLock(key: string): Promise<boolean> {
  try {
    const res = await guardedCache(() =>
      redis.set(`${key}:refresh-lock`, '1', 'PX', HOME_REFRESH_LOCK_TTL_MS, 'NX'),
    );
    return res === 'OK';
  } catch {
    return true;
  }
}

function assemble(key: string, query: GetHomepageQuery): Promise<HomepageResult> {
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const payload = await homeService.getHomepage(query);
    if (!isHomepageDegraded(payload)) await writeCache(key, payload);
    return payload;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

async function refreshInBackground(key: string, query: GetHomepageQuery): Promise<void> {
  if (inflight.has(key)) return; // this process is already rebuilding it
  if (!(await acquireRefreshLock(key))) return; // another process is
  assemble(key, query).catch(error => {
    // The stale entry keeps being served (until its hard TTL); the lock
    // expires on its own, so the next request retries.
    logger.warn('[home] background refresh failed, serving stale', error);
  });
}

export async function getCachedHomepage(query: GetHomepageQuery): Promise<HomepageResult> {
  const key = homeCacheKey(query);

  const cached = await readCache(key);
  if (cached) {
    if (Date.now() >= cached.softExpiresAt) {
      void refreshInBackground(key, query);
    }
    return cached.payload;
  }

  return assemble(key, query);
}
