// OpenNext Cloudflare cache adapters.
// The matching KV and Durable Object bindings are declared in wrangler.jsonc.
// Do not enable Cache API regional interception here: the application performs
// on-demand tag/path revalidation and must not introduce an unpurged regional
// cache layer until a production zone + cache-purge credentials are configured.
//
// These imports are intentionally ignored by local TypeScript environments
// where @opennextjs/cloudflare is not installed (e.g. constrained Termux setup).
// The Cloudflare build installs this package from frontend/package-lock.json.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - OpenNext package is installed in the Cloudflare build environment
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - OpenNext package is installed in the Cloudflare build environment
import kvIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - OpenNext package is installed in the Cloudflare build environment
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - OpenNext package is installed in the Cloudflare build environment
import doShardedTagCache from '@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache';

export default defineCloudflareConfig({
  // Workers KV-backed incremental cache. KV is eventually consistent; keep
  // user-specific and strictly fresh data out of the Next.js shared cache.
  incrementalCache: kvIncrementalCache,
  // Required for time-based revalidation and deduplication.
  queue: doQueue,
  // Supports App Router revalidateTag/revalidatePath invalidation.
  tagCache: doShardedTagCache({ baseShardSize: 12 }),
});
