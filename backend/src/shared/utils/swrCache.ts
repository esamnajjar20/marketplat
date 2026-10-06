import { randomUUID } from 'crypto';
import * as redisConfig from '../../config/redis';
import { logger } from './logger';
import { guardedCache, withCacheTimeout } from './cacheGuard';
import { cacheMetrics } from './cacheMetrics';

/**
 * one stale-while-revalidate engine shared by every public
 * Redis cache (home, /ads lists, stores/products/services/providers lists).
 *
 * It replaces three hand-rolled variants that each had a different gap:
 *  - home: a background refresh started BEFORE an invalidation could write its
 *    (now removed) data AFTER it, resurrecting a deleted ad for 30-40s;
 *  - /ads: a version bump dropped every list key at once (no SWR), and every
 *    read cost two sequential Redis round trips (version, then value);
 *  - stores/products/services/providers: no cache at all.
 *
 * ── Generation tokens (race-free invalidation) ──────────────────────────────
 * Each cache namespace has a "hard" generation key holding an opaque random
 * token. Every stored envelope is stamped with the token that was current when
 * its build STARTED. A reader treats an envelope whose stamp differs from the
 * current token as absent. So:
 *   invalidation = overwrite the token (one SET) — never a DEL race;
 *   a build that was already running stamps the OLD token, so whatever it
 *   writes afterwards is invisible to readers. There is nothing to compare or
 *   undo after the fact, which is what makes the race impossible rather than
 *   merely rare.
 * Tokens are random (not a counter) so an evicted/reset generation key can
 * never collide with a stamp on an old envelope.
 *
 * An optional "soft" generation gives a weaker invalidation for edits that may
 * be served one more time stale (create/edit/images): a soft mismatch serves
 * the old payload immediately and refreshes it in the background, so a burst
 * of writes never makes every visitor pay a synchronous rebuild.
 *
 * Value, hard token and soft token are fetched with ONE MGET round trip.
 *
 * Redis being slow/down is never fatal: reads/writes go through guardedCache
 * (300ms deadline + circuit breaker) and fall back to building directly.
 */

export type SwrStatus = 'hit' | 'stale' | 'miss' | 'bypass';

export interface SwrOptions<T> {
  /** Metrics label, e.g. "home", "ads:list". */
  name: string;
  key: string;
  hardGenKey: string;
  softGenKey?: string;
  /** Called on every write so callers can add jitter. */
  softTtlMs: () => number;
  hardTtlSec: number;
  /** Upper bound for one background rebuild; released early on completion. */
  lockTtlMs: number;
  build: () => Promise<T>;
  /** Return false for values that must not be pinned (e.g. degraded pages). */
  shouldCache?: (value: T) => boolean;
  /** false → skip Redis entirely (still singleflighted per process). */
  cacheable?: boolean;
}

interface Envelope<T> {
  /** Epoch ms when the payload was written. Optional: envelopes written before lack it. */
  writtenAt?: number;
  softExpiresAt: number; // epoch ms
  hard: string;
  soft?: string;
  payload: T;
}

interface CacheState {
  raw: string | null;
  hard: string;
  soft: string | null;
}

/**
 * every SWR key (payloads, generation tokens, refresh
 * locks, keep-warm leader) goes through the dedicated cache client when
 * REDIS_CACHE_HOST is configured, so an LRU-evicting cache instance can never
 * evict sessions / rate-limit counters (see config/redis.ts). Without it the
 * shared client is used, exactly as before. The `??` also keeps test doubles
 * that only export `redis` working.
 */
export const cacheClient = (): typeof redisConfig.redis =>
  (redisConfig as { cacheRedis?: typeof redisConfig.redis }).cacheRedis ?? redisConfig.redis;

const inflight = new Map<string, Promise<unknown>>();

const newToken = (): string => randomUUID();

/** Overwrites a generation token. Best-effort, one retry, never throws. */
export async function bumpGeneration(genKey: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // Timeout only (no circuit breaker): an invalidation must still be
      // attempted while the breaker is open, otherwise entries written before
      // the outage could be read as fresh after the breaker closes.
      await withCacheTimeout(() => cacheClient().set(genKey, newToken()));
      return true;
    } catch (error) {
      if (attempt === 1) {
        logger.warn(`[swr] failed to bump generation "${genKey}" — stale reads possible until soft TTL`, error);
      }
    }
  }
  return false;
}

/** First reader creates the token (NX), everyone then reads the same one. */
async function ensureGeneration(genKey: string): Promise<string> {
  const token = newToken();
  await guardedCache(() => cacheClient().set(genKey, token, 'NX'));
  const current = await guardedCache(() => cacheClient().get(genKey));
  return current ?? token;
}

async function readState<T>(o: SwrOptions<T>): Promise<CacheState> {
  const keys = o.softGenKey ? [o.key, o.hardGenKey, o.softGenKey] : [o.key, o.hardGenKey];
  const values = await guardedCache(() => cacheClient().mget(...keys));
  const raw = values[0] ?? null;
  const hard = values[1] ?? (await ensureGeneration(o.hardGenKey));
  const soft = o.softGenKey ? (values[2] ?? (await ensureGeneration(o.softGenKey))) : null;
  return { raw, hard, soft };
}

function parseEnvelope<T>(raw: string | null): Envelope<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Envelope<T>>;
    if (
      typeof parsed?.softExpiresAt !== 'number' ||
      typeof parsed.hard !== 'string' ||
      parsed.payload === undefined ||
      parsed.payload === null
    ) {
      return null;
    }
    return parsed as Envelope<T>;
  } catch {
    return null;
  }
}

/** 'fresh' | 'stale' (usable but due for refresh) | null (unusable → rebuild). */
function classify<T>(
  o: SwrOptions<T>,
  state: CacheState,
  envelope: Envelope<T> | null,
): 'fresh' | 'stale' | null {
  if (!envelope || envelope.hard !== state.hard) return null;
  const softMatches = !o.softGenKey || envelope.soft === state.soft;
  return softMatches && Date.now() < envelope.softExpiresAt ? 'fresh' : 'stale';
}

async function writeEnvelope<T>(o: SwrOptions<T>, state: CacheState, payload: T): Promise<void> {
  try {
    const now = Date.now();
    const envelope: Envelope<T> = {
      writtenAt: now,
      softExpiresAt: now + o.softTtlMs(),
      hard: state.hard,
      ...(state.soft !== null && { soft: state.soft }),
      payload,
    };
    await guardedCache(() => cacheClient().set(o.key, JSON.stringify(envelope), 'EX', o.hardTtlSec));
  } catch (error) {
    logger.warn(`[swr:${o.name}] cache write failed`, error);
  }
}

/**
 * Builds the value once per (process, key, generation). Keying the flight by
 * generation means a request arriving AFTER an invalidation never joins a
 * build that started before it (which would hand it pre-invalidation data).
 */
function build<T>(o: SwrOptions<T>, state: CacheState | null): Promise<T> {
  const flightKey = state ? `${o.key}|${state.hard}|${state.soft ?? ''}` : `${o.key}|nocache`;
  const pending = inflight.get(flightKey) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    const value = await o.build();
    if (state && (o.shouldCache?.(value) ?? true)) await writeEnvelope(o, state, value);
    return value;
  })().finally(() => {
    inflight.delete(flightKey);
  });

  inflight.set(flightKey, promise);
  return promise;
}

const RELEASE_LOCK_LUA =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/**
 * Cross-process "I am the one refreshing this key" lock (SET NX PX).
 * Returns the owner token, or null when another process holds it. Fails open
 * on Redis errors (returns a local token): the per-process singleflight still
 * stops a local stampede.
 */
async function acquireLock<T>(o: SwrOptions<T>): Promise<string | null> {
  const token = newToken();
  try {
    const res = await guardedCache(() =>
      cacheClient().set(`${o.key}:refresh-lock`, token, 'PX', o.lockTtlMs, 'NX'),
    );
    return res === 'OK' ? token : null;
  } catch {
    return 'local';
  }
}

/** Release only our own lock so the next mutation's refresh isn't blocked for the full TTL. */
async function releaseLock<T>(o: SwrOptions<T>, token: string): Promise<void> {
  if (token === 'local') return;
  try {
    await withCacheTimeout(() => cacheClient().eval(RELEASE_LOCK_LUA, 1, `${o.key}:refresh-lock`, token));
  } catch {
    // Harmless: the lock expires on its own after lockTtlMs.
  }
}

async function refreshInBackground<T>(o: SwrOptions<T>, state: CacheState): Promise<void> {
  const flightKey = `${o.key}|${state.hard}|${state.soft ?? ''}`;
  if (inflight.has(flightKey)) return; // this process is already rebuilding it
  const token = await acquireLock(o);
  if (!token) {
    cacheMetrics.record(o.name, 'lock_skip');
    return;
  }
  build(o, state)
    .then(() => cacheMetrics.record(o.name, 'refresh_ok'))
    .catch(error => {
      // The stale entry keeps being served (until its hard TTL); the lock is
      // released below so the next request retries.
      cacheMetrics.record(o.name, 'refresh_fail');
      logger.warn(`[swr:${o.name}] background refresh failed, serving stale`, error);
    })
    .finally(() => {
      void releaseLock(o, token);
    });
}

export async function swrGetWithStatus<T>(
  o: SwrOptions<T>,
): Promise<{ value: T; status: SwrStatus }> {
  if (o.cacheable === false) {
    cacheMetrics.record(o.name, 'bypass');
    return { value: await build(o, null), status: 'bypass' };
  }

  let state: CacheState;
  try {
    state = await readState(o);
  } catch (error) {
    logger.warn(`[swr:${o.name}] cache read failed, falling back to DB`, error);
    cacheMetrics.record(o.name, 'bypass');
    return { value: await build(o, null), status: 'bypass' };
  }

  const envelope = parseEnvelope<T>(state.raw);
  const verdict = classify(o, state, envelope);

  if (verdict === 'fresh') {
    cacheMetrics.record(o.name, 'hit');
    return { value: envelope!.payload, status: 'hit' };
  }
  if (verdict === 'stale') {
    cacheMetrics.record(o.name, 'stale');
    void refreshInBackground(o, state);
    return { value: envelope!.payload, status: 'stale' };
  }

  cacheMetrics.record(o.name, 'miss');
  return { value: await build(o, state), status: 'miss' };
}

export async function swrGet<T>(o: SwrOptions<T>): Promise<T> {
  return (await swrGetWithStatus(o)).value;
}

export interface EnsureFreshOptions {
  /**
   * keep-warm exists to stop a key from falling off
   * its HARD TTL, not to chase the (much shorter) soft TTL — real traffic
   * already refreshes soft-stale entries in the background. With this set, an
   * entry that is only soft-expired is left alone while it is younger than
   * `maxAgeMs`. Entries that are missing, hard-invalidated, soft-INVALIDATED
   * (an edit happened) or lacking a write timestamp are still rebuilt.
   * Must stay below hardTtl - keep-warm interval, or a key can expire between
   * two cycles.
   */
  maxAgeMs?: number;
}

/**
 * Keep-warm entry point: rebuild the key only if it is missing, invalidated or
 * due (see EnsureFreshOptions), and only if no other process is already doing
 * it. Throws when Redis is unreachable (there is nothing to warm then) — the
 * caller decides how to log it.
 */
export async function swrEnsureFresh<T>(
  o: SwrOptions<T>,
  opts: EnsureFreshOptions = {},
): Promise<'fresh' | 'refreshed' | 'skipped'> {
  const state = await readState(o);
  const envelope = parseEnvelope<T>(state.raw);
  const verdict = classify(o, state, envelope);
  if (verdict === 'fresh') return 'fresh';

  if (
    verdict === 'stale' &&
    opts.maxAgeMs !== undefined &&
    envelope &&
    typeof envelope.writtenAt === 'number' &&
    (!o.softGenKey || envelope.soft === state.soft) && // soft-expired only, not soft-invalidated
    Date.now() - envelope.writtenAt < opts.maxAgeMs
  ) {
    return 'fresh';
  }

  const token = await acquireLock(o);
  if (!token) {
    cacheMetrics.record(o.name, 'lock_skip');
    return 'skipped';
  }
  try {
    await build(o, state);
    cacheMetrics.record(o.name, 'refresh_ok');
    return 'refreshed';
  } catch (error) {
    cacheMetrics.record(o.name, 'refresh_fail');
    throw error;
  } finally {
    await releaseLock(o, token);
  }
}
