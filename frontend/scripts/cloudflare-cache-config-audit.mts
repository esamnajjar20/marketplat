import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';




const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), 'utf8');
const config = read('frontend/open-next.config.ts');
const wrangler = read('frontend/wrangler.jsonc');
const workerEntry = read('frontend/worker.ts');
const serverFetch = read('frontend/lib/server/serverApiFetch.ts');
const revalidateRoute = read('frontend/app/api/internal/cache/revalidate/route.ts');
const sellerRankingPage = read('frontend/app/(public)/sellers/ranking/page.tsx');
const trendingPage = read('frontend/app/(public)/trending/page.tsx');

const checks = [
  ['KV incremental cache adapter configured', /incrementalCache:\s*kvIncrementalCache/.test(config)],
  ['Durable Object revalidation queue configured', /queue:\s*doQueue/.test(config)],
  ['sharded tag cache configured for App Router invalidation', /tagCache:\s*doShardedTagCache\(/.test(config)],
  ['KV binding matches OpenNext runtime contract', /"binding":\s*"NEXT_INC_CACHE_KV"/.test(wrangler)],
  ['KV namespace binding has a valid ID slot or setup placeholder', /"id":\s*"(?:[a-f0-9]{32}|REPLACE_WITH_NEXT_INC_CACHE_KV_NAMESPACE_ID)"/i.test(wrangler)],
  ['R2 binding has been removed', !/NEXT_INC_CACHE_R2_BUCKET|r2_buckets/.test(wrangler + config)],
  ['Wrangler uses the custom worker entry point', /"main":\s*"\.\/worker\.ts"/.test(wrangler)],
  ['custom worker forwards the generated fetch handler', /fetch:\s*handler\.fetch/.test(workerEntry)],
  ['custom worker exports the OpenNext queue Durable Object', /export\s*\{[^}]*DOQueueHandler[^}]*\}\s*from/.test(workerEntry)],
  ['custom worker exports the OpenNext sharded tag Durable Object', /export\s*\{[^}]*DOShardedTagCache[^}]*\}\s*from/.test(workerEntry)],
  ['queue Durable Object binding exists', /"name":\s*"NEXT_CACHE_DO_QUEUE"[\s\S]*?"class_name":\s*"DOQueueHandler"/.test(wrangler)],
  ['sharded tag Durable Object binding exists', /"name":\s*"NEXT_TAG_CACHE_DO_SHARDED"[\s\S]*?"class_name":\s*"DOShardedTagCache"/.test(wrangler)],
  ['both Durable Object classes are included in migration', /"new_sqlite_classes":\s*\[[\s\S]*?"DOQueueHandler"[\s\S]*?"DOShardedTagCache"/.test(wrangler)],
  ['self service binding retained', /"binding":\s*"WORKER_SELF_REFERENCE"[\s\S]*?"service":\s*"marketplat"/.test(wrangler)],
  ['server public cache remains backed by unstable_cache', /unstable_cache\(/.test(serverFetch)],
  ['seller ranking remains server-rendered per request', /export const dynamic = 'force-dynamic'/.test(sellerRankingPage)],
  ['trending remains server-rendered per request', /export const dynamic = 'force-dynamic'/.test(trendingPage)],
  ['seller ranking skips optional API prefetch during production build', /if\s*\(!isNextProductionBuild\(\)\)/.test(sellerRankingPage)],
  ['trending skips optional API prefetch during production build', /if\s*\(!isNextProductionBuild\(\)\)/.test(trendingPage)],
  ['on-demand revalidation still validates HMAC', /crypto\.subtle\.sign/.test(revalidateRoute) && /MAX_CLOCK_SKEW_SECONDS/.test(revalidateRoute)],
  ['on-demand revalidation still calls Next tag/path APIs', /revalidateTag\(/.test(revalidateRoute) && /revalidatePath\(/.test(revalidateRoute)],
];

for (const [name, passed] of checks) {
  if (passed) console.log(`[cloudflare-cache] PASS ${name}`);
  else console.error(`[cloudflare-cache] FAIL ${name}`);
}
assert.ok(checks.every(([, passed]) => passed), 'Cloudflare cache configuration contract failed');
console.log(`[cloudflare-cache] ${checks.length}/${checks.length} checks passed`);
if (wrangler.includes('REPLACE_WITH_NEXT_INC_CACHE_KV_NAMESPACE_ID')) {
  console.warn('[cloudflare-cache] BLOCKED: create NEXT_INC_CACHE_KV and replace the placeholder ID before build/deploy.');
}
