import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');
const serverFetch = read('frontend/lib/server/serverApiFetch.ts');
const serverTags = read('frontend/lib/server/serverCacheTags.ts');
const legacyAdapter = read('frontend/lib/serverApiAdapter.ts');
const route = read('frontend/app/api/internal/cache/revalidate/route.ts');
const backendTags = read('apps/api/src/shared/cache/publicMutationTags.ts');
const prefetch = read('frontend/lib/prefetch.ts');
const backendPurge = read('apps/api/src/shared/cache/edgePurge.ts');
const apiApp = read('apps/api/src/app.ts');
const apiEnv = read('apps/api/src/config/env.ts');

const checks = [
  ['Next unstable_cache owns persistent server API caching', /unstable_cache\(/.test(serverFetch)],
  ['React.cache deduplicates server API calls within a render request', /const requestApiEnvelope = cache\(/.test(serverFetch)],
  ['Server API reader is protected from client imports', /import 'server-only'/.test(serverFetch)],
  ['Cloudflare SSR uses API_WORKER Service Binding', /apiWorker\.fetch\(/.test(serverFetch)],
  ['Legacy anonymous Axios SSR path does not fall back after a Cloudflare binding failure', /contextAvailable/.test(legacyAdapter) && /API_WORKER service binding request failed/.test(legacyAdapter)],
  ['Missing Cloudflare binding fails closed', /API_WORKER service binding is unavailable/.test(serverFetch)],
  ['Public caching is explicitly allowlisted by endpoint tags', /getPublicApiCacheTags\(normalizedPath\)/.test(serverFetch)],
  ['Free-text and identity-like query values bypass persistent Data Cache', /bypassPublicCache/.test(prefetch) && /mode: 'no-store'/.test(prefetch)],
  ['Only canonical unfiltered first-page browse lists enter persistent Data Cache', /isCanonicalDefaultList/.test(prefetch) && /!cacheableParams\.has\(key\)/.test(prefetch)],
  ['The global api tag supports bounded-queue collapse', /\[\.\.\.matched\.tags, 'api'\]/.test(serverTags) && /tag === 'api'/.test(route)],
  ['No-store reads bypass unstable_cache', /policy\.mode === 'no-store'[\s\S]*?requestApiEnvelope/.test(serverFetch)],
  ['The invalidation endpoint validates HMAC and clock skew', /crypto\.subtle\.sign/.test(route) && /MAX_CLOCK_SKEW_SECONDS/.test(route)],
  ['The invalidation endpoint bounds streamed request bodies', /readBoundedBody/.test(route) && /MAX_BODY_BYTES/.test(route)],
  ['The invalidation endpoint validates tags and maps App Router paths', /isAllowedTag\(tag\)/.test(route) && /revalidatePath\(/.test(route)],
  ['City-scoped Worker ad purges also invalidate the shared Next ads and homepage cache', /tag\.startsWith\('city:'\)/.test(route) && /effectiveTags\.add\('route:ads'\)/.test(route) && /effectiveTags\.add\('route:home'\)/.test(route)],
  ['Backend maps successful public mutations to cache tags', /publicMutationCacheTags\(req\.method, req\.originalUrl\)/.test(apiApp)],
  ['Backend invalidation covers admin moderation resources and ignores personal actions', /segments\[0\] === 'admin'/.test(backendTags) && /NON_PUBLIC_CONTENT_ACTIONS/.test(backendTags)],
  ['Backend triggers invalidation only after successful responses', /res\.once\('finish'[\s\S]*?res\.statusCode >= 200 && res\.statusCode < 300/.test(apiApp)],
  ['Backend signs invalidation requests with HMAC-SHA256', /createHmac\('sha256'/.test(backendPurge)],
  ['Backend configuration supports optional Next cache webhook credentials', /NEXT_CACHE_REVALIDATION_URL/.test(apiEnv) && /NEXT_CACHE_REVALIDATION_SECRET/.test(apiEnv)],
];

for (const [name, passed] of checks) {
  if (!passed) console.error(`[server-cache-phase2] FAIL ${name}`);
}
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`Server cache phase 2 audit: ${checks.length}/${checks.length} checks passed`);
