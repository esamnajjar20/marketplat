import { env } from '../../config/env';
import { logger } from '../utils/logger';

/**
 * Edge cache purge by Cache-Tag (Cloudflare) + purge-aware edge TTLs.
 *
 * WHY: raising the edge TTL delays "تم البيع" (sold / deleted / edited) unless the
 * edge can be purged on write. The API Worker (workers/cf-api-proxy/worker.js)
 * stamps every cached response with a `Cache-Tag` header; the mutations below
 * purge those tags through the Cloudflare API, and only THEN do the ads routes use
 * long s-maxage values (see `purgeAwareSharedMaxAge`).
 *
 * Everything here is opt-in (env.edgePurge.enabled) and best-effort: a purge
 * failure is logged, never thrown, and never blocks the mutation.
 *
 * TAG VOCABULARY — MUST stay identical to `edgeTagsFor()` in the Worker
 * (tests/unit/edgePurge.test.ts and workers/cf-api-proxy/cache-policy.test.mjs pin
 * the same literals):
 *   api                     every cached API response
 *   route:<segment>         first path segment after /api/v1   (route:ads, route:home …)
 *   ad:<id>                 /api/v1/ads/<id>
 *   city:<slug>             response filtered by ?city=<city>
 *   city:any                response NOT filtered by city
 */

export type AdEdgeKind = 'edit' | 'create' | 'hide';

export interface AdEdgeContext {
  adId?: string;
  /** string = the ad's city, null = ad has no city, undefined = unknown (purge broadly). */
  city?: string | null;
  /** previous city when an edit moved the ad between cities. */
  prevCity?: string | null;
  kind?: AdEdgeKind;
}

/** Same normalisation as the Worker's cityTagValue(). */
export function cityTagValue(city: string): string {
  return encodeURIComponent(
    String(city).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase().replace(/ /g, '-')
  );
}

/**
 * Tags to purge for a change to an ad.
 *  - hide/create also change what the homepage and search show → route:home / route:search
 *  - edit only touches the ad's own detail + the lists it can appear in
 *  - unknown city (undefined) can't be targeted → every ads response (route:ads)
 */
export function adEdgeTags(ctx: AdEdgeContext = {}): string[] {
  const kind: AdEdgeKind = ctx.kind ?? 'edit';
  const tags = new Set<string>();

  if (ctx.city === undefined) {
    // Can't target a city: every ads response (lists, details, related) goes.
    tags.add('route:ads');
  } else {
    if (ctx.adId) tags.add(`ad:${ctx.adId}`);
    // Unfiltered lists, /ads/:id/related and ads search carry no city param.
    tags.add('city:any');
    for (const city of [ctx.city, ctx.prevCity]) {
      if (city && city.trim()) tags.add(`city:${cityTagValue(city)}`);
    }
  }

  if (kind !== 'edit') {
    tags.add('route:home');
    tags.add('route:search');
  }
  return [...tags];
}

/* ───────────────────────── purge transport ───────────────────────── */

const COALESCE_MS = 1000; // merge bursts of writes into one API call
const MAX_TAGS_PER_CALL = 30; // Cloudflare limit for purge-by-tag
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 5000;

const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

// `env.edgePurge` is read defensively: unit tests that mock ../config/env with a
// partial object must not crash the mutation paths that now call into this module.
const config = () => (env as { edgePurge?: typeof env.edgePurge }).edgePurge;

export const isEdgePurgeEnabled = (): boolean => Boolean(config()?.enabled);

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function postPurge(tags: string[]): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cfg.zoneId)}/purge_cache`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tags }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );
      if (res.ok) return;
      lastError = new Error(`Cloudflare purge HTTP ${res.status}`);
      // 4xx other than rate-limit will not get better by retrying.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(attempt * 1000);
  }
  logger.error(
    'Edge purge failed — cached responses may stay stale until their s-maxage expires',
    { tags, error: lastError }
  );
}

/** Sends everything queued right now. Exposed for graceful shutdown and tests. */
export async function flushEdgePurge(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  const batch = [...pending];
  pending.clear();
  for (let i = 0; i < batch.length; i += MAX_TAGS_PER_CALL) {
    await postPurge(batch.slice(i, i + MAX_TAGS_PER_CALL));
  }
}

/** Fire-and-forget. Coalesces calls made within COALESCE_MS into one request. */
export function purgeEdgeTags(tags: readonly string[]): void {
  if (!isEdgePurgeEnabled() || tags.length === 0) return;
  for (const tag of tags) pending.add(tag);
  if (timer) return;
  timer = setTimeout(() => {
    flushEdgePurge().catch(error => logger.error('Edge purge flush crashed', error));
  }, COALESCE_MS);
  timer.unref?.();
}

/** Purge what a change to an ad can affect on the edge. Never throws. */
export function purgeAdEdge(ctx?: AdEdgeContext): void {
  try {
    purgeEdgeTags(adEdgeTags(ctx));
  } catch (error) {
    logger.error('Edge purge (ads) failed to enqueue', error);
  }
}

/**
 * Flush the Worker's Workers-KV reference tier (categories & co.). No-op unless
 * EDGE_WORKER_PURGE_URL + EDGE_WORKER_PURGE_TOKEN are configured. Never throws.
 */
export function purgeReferenceKv(): void {
  const cfg = config();
  if (!cfg?.workerPurgeUrl || !cfg.workerPurgeToken) return;
  fetch(cfg.workerPurgeUrl, {
    method: 'POST',
    headers: { 'x-purge-token': cfg.workerPurgeToken },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
    .then(res => {
      if (!res.ok) logger.warn(`Edge KV purge HTTP ${res.status}`);
    })
    .catch(error => logger.warn('Edge KV purge failed', error));
}

/* ───────────────────────── purge-aware TTLs ───────────────────────── */

/**
 * Edge (s-maxage) TTLs used ONLY when purging is on. Applied to the ads routes
 * because those are the routes every ad mutation purges; products/stores/services
 * keep their policy TTL until they get purge hooks of their own.
 *   adsList   600s   lists also change on create/boost/expiry, which have no purge
 *   adsDetail 3600s  every edit/sold/delete of an ad purges `ad:<id>`
 */
export const EDGE_PURGE_SHARED_MAX_AGE = { adsList: 600, adsDetail: 3600 } as const;

export function purgeAwareSharedMaxAge(
  kind: keyof typeof EDGE_PURGE_SHARED_MAX_AGE,
  fallback: number | undefined
): number | undefined {
  if (!isEdgePurgeEnabled()) return fallback;
  return Math.max(EDGE_PURGE_SHARED_MAX_AGE[kind], fallback ?? 0);
}
