import { ensureHomepageFresh, HOME_KEEPWARM_MAX_AGE_MS } from '../../modules/home/home.cache';
import { HOME_CITIES } from '../../modules/home/home.validation';
import { categoriesService } from '../../modules/categories/categories.service';
import { productCategoriesService } from '../../modules/product-categories/product-categories.service';
import { serviceCategoriesService } from '../../modules/service-categories/service-categories.service';
import { guardedCache } from './cacheGuard';
import { cacheMetrics } from './cacheMetrics';
import { cacheClient } from './swrCache';
import { logger } from './logger';

/**
 * FIX CACHE-WARMUP-01 / CACHE-KEEPWARM-01: keep the public, viewer-independent
 * Redis caches warm — at boot AND continuously.
 *
 * Why boot warmup alone was not enough: the homepage entry lives 10 minutes
 * (hard TTL) and after that the first visitor of every key pays the whole
 * 11+ query assembly again. The boot warmup ran once and only covered the
 * "general" key, so the 10 city variants were always cold and everything went
 * cold again after ~10 minutes without traffic.
 *
 * Now:
 *  - every home key (general + all allow-listed cities) and the three category
 *    trees are covered;
 *  - a keep-warm loop re-checks them every KEEP_WARM_INTERVAL_MS (well under
 *    the 10-minute hard TTL) and rebuilds only what is missing, invalidated or
 *    older than HOME_KEEPWARM_MAX_AGE_MS (so it never falls off the hard TTL,
 *    and never re-runs an assembly real traffic just refreshed) — a healthy
 *    cache costs 11 cheap Redis reads per cycle;
 *  - the loop is leader-elected through a Redis lock, so PM2 cluster workers
 *    (or several Railway replicas) don't all rebuild the same keys;
 *  - rebuilds go through the same lock/singleflight/generation logic real
 *    requests use, so warming can never write a shape or a stale generation
 *    the readers don't expect;
 *  - sequential with a short pause: a cold start never fans out a burst of
 *    queries;
 *  - failures are logged and swallowed: warming is an optimisation, never a
 *    startup dependency. If Redis is unreachable the cycle is skipped.
 *
 * Only keys identical for every viewer (no per-user data) are warmed.
 */
export const KEEP_WARM_INTERVAL_MS = 4 * 60_000;
export const KEEP_WARM_LEADER_KEY = 'cache:keepwarm:leader';
export const WARMUP_PAUSE_MS = 150;

export interface WarmupTask {
  name: string;
  run: () => Promise<unknown>;
}

const homeTask = (city: string | undefined): WarmupTask => ({
  name: `home:${city ?? 'general'}`,
  // Age-gated: a key that real traffic (or the post-invalidation rewarm) rebuilt
  // recently is skipped, so an idle-but-healthy cache costs 11 cheap reads per
  // cycle instead of 11 full assemblies.
  run: () => ensureHomepageFresh({ city }, { maxAgeMs: HOME_KEEPWARM_MAX_AGE_MS }),
});

// Order matters: general first (most traffic), then the category trees (every
// city homepage embeds them, so they are already cached when cities rebuild),
// then the ten city variants.
export const WARMUP_TASKS: ReadonlyArray<WarmupTask> = [
  homeTask(undefined),
  { name: 'categories', run: () => categoriesService.getCategories() },
  { name: 'product-categories', run: () => productCategoriesService.getProductCategories() },
  { name: 'service-categories', run: () => serviceCategoriesService.getServiceCategories() },
  ...HOME_CITIES.map(city => homeTask(city)),
];

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export async function warmPublicCaches(
  tasks: ReadonlyArray<WarmupTask> = WARMUP_TASKS,
  pauseMs = 0,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    try {
      await task.run();
      ok += 1;
    } catch (error) {
      failed += 1;
      logger.warn(`[cache-warmup] ${task.name} failed`, error);
    }
    if (pauseMs > 0 && i < tasks.length - 1) await sleep(pauseMs);
  }

  logger.info('[cache-warmup] done', { ok, failed, ms: Date.now() - startedAt });
  return { ok, failed };
}

/** Only one process per interval runs the cycle. Fails closed: no Redis → nothing to warm. */
async function acquireLeadership(intervalMs: number): Promise<boolean> {
  try {
    const res = await guardedCache(() =>
      cacheClient().set(KEEP_WARM_LEADER_KEY, String(process.pid), 'PX', Math.max(1_000, intervalMs - 5_000), 'NX'),
    );
    return res === 'OK';
  } catch {
    return false;
  }
}

export async function runKeepWarmCycle(
  intervalMs = KEEP_WARM_INTERVAL_MS,
): Promise<{ ok: number; failed: number } | null> {
  if (!(await acquireLeadership(intervalMs))) return null;
  const result = await warmPublicCaches(WARMUP_TASKS, WARMUP_PAUSE_MS);
  // Hit ratio / synchronous-rebuild counts since boot, so "is the cache
  // actually working?" is answerable from the logs.
  logger.info('[cache-metrics]', cacheMetrics.snapshot());
  return result;
}

/**
 * Entry point for server.ts: first cycle after `initialDelayMs` (lets the
 * process finish its own startup), then every `intervalMs`. Timers are
 * unref()'d so they never delay a graceful shutdown. Returns a stop function.
 */
export function startCacheKeepWarm(
  options: { initialDelayMs?: number; intervalMs?: number } = {},
): () => void {
  const { initialDelayMs = 2_000, intervalMs = KEEP_WARM_INTERVAL_MS } = options;
  let running = false;
  let interval: NodeJS.Timeout | undefined;

  const tick = async (): Promise<void> => {
    if (running) return; // a slow cycle must never overlap the next one
    running = true;
    try {
      await runKeepWarmCycle(intervalMs);
    } catch (error) {
      logger.warn('[cache-warmup] unexpected failure', error);
    } finally {
      running = false;
    }
  };

  const first = setTimeout(() => {
    void tick();
    interval = setInterval(() => void tick(), intervalMs);
    interval.unref();
  }, initialDelayMs);
  first.unref();

  return () => {
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}
