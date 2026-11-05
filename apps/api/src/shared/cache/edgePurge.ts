import { createHmac } from 'node:crypto';
import { env } from '../../config/env';
import { logger } from '../utils/logger';

/**
 * Shared cache invalidation by Cache-Tag (Workers Cache, optional zone cache,
 * and the Next.js Data Cache webhook) plus purge-aware edge TTLs.
 *
 * The API Worker runs on workers.dev, where the legacy Cache API is unavailable.
 * The Worker-native cache therefore receives tag purges through its authenticated
 * /__purge__ endpoint. A zone API purge remains optional for custom-domain caches.
 * Long ads TTLs are enabled only when the native Worker purge path is configured.
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
 * Next.js route tags use the same route:* vocabulary; entity tags are ad/product/store/service/provider/category:<id>.
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
const MAX_PENDING_TAGS = 1000;
const RETRY_DELAY_MS = 30_000;
const BLOCKED_RETRY_DELAY_MS = 5 * 60_000;

const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let flushPromise: Promise<void> | undefined;

function scheduleFlush(delayMs: number): void {
  if (timer || pending.size === 0) return;
  timer = setTimeout(() => {
    timer = undefined;
    flushEdgePurge().catch(error => logger.error('Edge purge flush crashed', error));
  }, delayMs);
  timer.unref?.();
}

// `env.edgePurge` is read defensively: unit tests that mock ../config/env with a
// partial object must not crash the mutation paths that now call into this module.
const config = () => (env as { edgePurge?: typeof env.edgePurge }).edgePurge;

const isZonePurgeConfigured = (cfg = config()): boolean => Boolean(cfg?.zoneId && cfg.apiToken);
export const isWorkerCachePurgeEnabled = (): boolean => {
  const cfg = config();
  return Boolean(cfg?.enabled && cfg.workerPurgeUrl && cfg.workerPurgeToken);
};
export const isEdgePurgeEnabled = (): boolean => {
  const cfg = config();
  return Boolean(
    cfg?.enabled && (
      isZonePurgeConfigured(cfg) ||
      (cfg.workerPurgeUrl && cfg.workerPurgeToken) ||
      (cfg.nextRevalidationUrl && cfg.nextRevalidationSecret)
    )
  );
};

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

type PurgeResult = 'success' | 'retry' | 'blocked';

async function retryPurgeTarget(
  label: string,
  send: () => Promise<{ ok: boolean; status: number; accepted: boolean; detail?: string }>,
  tags: string[]
): Promise<PurgeResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await send();
      if (result.ok && result.accepted) return 'success';
      lastError = new Error(result.detail || `${label} purge HTTP ${result.status}`);
      // Permanent authentication/validation errors will not get better by retrying.
      if (result.status >= 400 && result.status < 500 && result.status !== 429) {
        logger.error(`${label} purge rejected permanently; tags retained for slower retry`, { status: result.status, tags });
        return 'blocked';
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(attempt * 1000);
  }
  logger.error(`${label} purge failed — tags retained for retry`, { tags, error: lastError });
  return 'retry';
}

async function postPurge(tags: string[]): Promise<PurgeResult> {
  const cfg = config();
  if (!cfg?.enabled) return 'blocked';
  const jobs: Array<Promise<PurgeResult>> = [];

  // The native Workers Cache is the real edge cache for this workers.dev host.
  if (cfg.workerPurgeUrl && cfg.workerPurgeToken) {
    jobs.push(retryPurgeTarget('Workers Cache', async () => {
      const res = await fetch(cfg.workerPurgeUrl!, {
        method: 'POST',
        headers: {
          'x-purge-token': cfg.workerPurgeToken!,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const payload = (typeof res.json === 'function' ? await res.json().catch(() => null) : null) as { ok?: boolean; error?: string } | null;
      return {
        ok: res.ok,
        status: res.status,
        accepted: payload?.ok === true,
        detail: payload?.error ? `Workers Cache purge rejected: ${payload.error}` : `Workers Cache purge HTTP ${res.status}`,
      };
    }, tags));
  }

  // Next.js Data Cache invalidation. This shares the same coalesced tag batch
  // as the Worker purge, but uses an HMAC-signed webhook so the Route Handler
  // never accepts unauthenticated cache invalidation requests.
  if (cfg.nextRevalidationUrl && cfg.nextRevalidationSecret) {
    jobs.push(retryPurgeTarget('Next.js Data Cache', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({ tags });
      const signature = createHmac('sha256', cfg.nextRevalidationSecret!)
        .update(`${timestamp}.${body}`)
        .digest('hex');
      const res = await fetch(cfg.nextRevalidationUrl!, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-marketplat-timestamp': timestamp,
          'x-marketplat-signature': `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const payload = (typeof res.json === 'function' ? await res.json().catch(() => null) : null) as { ok?: boolean; error?: string } | null;
      return {
        ok: res.ok,
        status: res.status,
        accepted: payload?.ok === true,
        detail: payload?.error ? `Next.js cache revalidation rejected: ${payload.error}` : `Next.js cache revalidation HTTP ${res.status}`,
      };
    }, tags));
  }

  // Keep the zone purge for optional custom-domain Cache API / CDN caches.
  if (isZonePurgeConfigured(cfg)) {
    jobs.push(retryPurgeTarget('Cloudflare Zone', async () => {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cfg!.zoneId!)}/purge_cache`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg!.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tags }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );
      const payload = (typeof res.json === 'function' ? await res.json().catch(() => null) : null) as { success?: boolean; errors?: unknown[] } | null;
      return {
        ok: res.ok,
        status: res.status,
        accepted: payload?.success === true,
        detail: payload?.success === false
          ? `Cloudflare purge rejected: ${JSON.stringify(payload.errors ?? [])}`
          : `Cloudflare purge HTTP ${res.status}`,
      };
    }, tags));
  }

  if (!jobs.length) {
    logger.error('Edge purge is enabled but no purge destination is configured; tags retained for retry');
    return 'blocked';
  }
  const results = await Promise.all(jobs);
  if (results.every(result => result === 'success')) return 'success';
  return results.includes('blocked') ? 'blocked' : 'retry';
}

/** Sends everything queued right now. Exposed for graceful shutdown and tests. */
export async function flushEdgePurge(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  if (flushPromise) return flushPromise;

  flushPromise = (async () => {
    const batch = [...pending];
    pending.clear();
    const failed: string[] = [];
    let hasBlockedBatch = false;
    for (let i = 0; i < batch.length; i += MAX_TAGS_PER_CALL) {
      const chunk = batch.slice(i, i + MAX_TAGS_PER_CALL);
      const result = await postPurge(chunk);
      if (result !== 'success') {
        failed.push(...chunk);
        if (result === 'blocked') hasBlockedBatch = true;
      }
    }

    // Never silently drop invalidations on network/Cloudflare failure. If the
    // bounded queue would overflow, collapse it to the global `api` tag, which
    // every Worker-cached response carries.
    if (failed.length) {
      if (pending.size + failed.length > MAX_PENDING_TAGS) {
        pending.clear();
        pending.add('api');
      } else {
        failed.forEach(tag => pending.add(tag));
      }
    }
    if (pending.size) scheduleFlush(hasBlockedBatch ? BLOCKED_RETRY_DELAY_MS : RETRY_DELAY_MS);
  })();

  try {
    await flushPromise;
  } finally {
    flushPromise = undefined;
  }
}

/** Fire-and-forget. Coalesces calls made within COALESCE_MS into one request. */
export function purgeEdgeTags(tags: readonly string[]): void {
  if (!isEdgePurgeEnabled() || tags.length === 0) return;
  for (const tag of tags) {
    pending.add(tag);
    if (pending.size > MAX_PENDING_TAGS) {
      pending.clear();
      pending.add('api');
      break;
    }
  }
  scheduleFlush(COALESCE_MS);
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
    .then(async res => {
      const payload = (typeof res.json === 'function' ? await res.json().catch(() => null) : null) as { ok?: boolean } | null;
      if (!res.ok || payload?.ok !== true) {
        logger.warn(`Edge KV purge rejected (HTTP ${res.status}; response=${JSON.stringify(payload)})`);
      }
    })
    .catch(error => logger.warn('Edge KV purge failed', error));
}

/* ───────────────────────── purge-aware TTLs ───────────────────────── */

/**
 * Edge (s-maxage) TTLs used ONLY when purging is on. Applied to the ads routes
 * because those are the routes every ad mutation purges; products/stores/services
 * keep their policy TTL until they get purge hooks of their own.
 *   adsList   600s   create/edit/pin/boost/expiry paths purge city/list tags or route:ads
 *   adsDetail 3600s  edit/status/remove paths purge the matching `ad:<id>` tag
 */
export const EDGE_PURGE_SHARED_MAX_AGE = { adsList: 600, adsDetail: 3600 } as const;

export function purgeAwareSharedMaxAge(
  kind: keyof typeof EDGE_PURGE_SHARED_MAX_AGE,
  fallback: number | undefined
): number | undefined {
  // The Worker Cache API purge endpoint must be deployed and configured; a
  // zone-only purge does not reliably invalidate the worker-native cache.
  if (!isWorkerCachePurgeEnabled()) return fallback;
  return Math.max(EDGE_PURGE_SHARED_MAX_AGE[kind], fallback ?? 0);
}
