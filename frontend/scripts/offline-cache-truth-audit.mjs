#!/usr/bin/env node
/** Static guardrails for offline document caching, route truth, and visit priority. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const sw = read('public/sw.js');
const routes = read('lib/offlineRouteShells.ts');
const list = read('components/settings/OfflineRoutesList.tsx');
const tests = read('__tests__/unit/lib/sw.test.ts');
const failures = [];
let passed = 0;
function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`[offline-cache-truth] PASS ${label}`);
  } else {
    failures.push(label);
    console.error(`[offline-cache-truth] FAIL ${label}`);
  }
}

check('network-first handler derives the request URL locally (no free url variable)', /async function networkFirstPage\(event, request\)\s*\{[\s\S]{0,180}const url = new URL\(request\.url\);/.test(sw));
check('hard document visits trigger HTML plus initial asset capture', /if \(isHtmlVisit\)[\s\S]{0,300}cacheVisitedDocumentShell\(url, cache, response\.clone\(\), STATIC_CACHE\)/.test(sw));
check('route-commit messages, not RSC requests or prefetches, capture visited HTML shells', /async function networkOnlyRscRequest\([\s\S]{0,1000}Do not infer a real visit from an RSC request/.test(sw) && /if \(type === 'CACHE_VISITED_PAGE'\)/.test(sw) && /cacheVisitedPageFromClient\(event\.data\?\.url\)/.test(sw) && /VisitedPageShellTracker/.test(read('components/pwa/VisitedPageShellTracker.tsx')));
check('all active RSC requests bypass shared shell lookup and use the network-only handler', /async function handlePageRequest\(event, request, url\) \{\s*\/\/ RSC responses[\s\S]{0,140}if \(isRscShellRequest\(request\)\) return networkOnlyRscRequest/.test(sw));
check('public document navigations use network-first freshness while retaining offline fallback', /return networkFirstPage\(event, request\);/.test(sw) && !/return staleWhileRevalidatePage\(event, request, cacheKey\);/.test(sw));
check('HTML cache writes remove Vary and distinguish new visits from recovery',
  /await stripVaryAndClone\(response\),\s*recovering \? 'visit-recovery' : 'visit'/.test(sw));
check('activation migrates legacy cached HTML with Vary without deleting user caches', /async function normalizeExistingHtmlCache\(cacheName\)/.test(sw) && /normalizeExistingHtmlCache\(STATIC_CACHE\)/.test(sw) && /normalizeExistingHtmlCache\(PERSONAL_SHELL_CACHE\)/.test(sw));
check('initial assets are marked and prioritized with their visited page', /putTimestamped\(staticCache, item\.assetUrl, item\.asset, 'visit-asset'\)/.test(sw) && /source === 'visit-asset' \? 160000/.test(sw));
check('HTML is committed only after all initial assets pass MIME/status verification', /isUsableStaticAssetResponse\(assetUrl, asset\)/.test(sw) && /await htmlCache\.delete\(cacheKey\)/.test(sw) && /isUsableStaticAssetResponse\(url, res\)/.test(routes));
check('route completeness validates JavaScript/CSS MIME types, not only cache-key presence', /contentType === 'text\/css'/.test(routes) && /contentType\.includes\('javascript'\)/.test(routes) && /isUsableStaticAssetResponse\(url, await staticCache\.match\(url\)\)/.test(routes));
check('single-route deletion scans actual HTML in both caches before deleting shared chunks', /const targetAssets = new Set<string>/.test(routes) && /new Set\(\[STATIC_CACHE, PERSONAL_SHELL_CACHE\]\)/.test(routes) && /sharedChunks\.has\(asset\)/.test(routes));
check('RSC payloads do not consume the priority reserved for HTML route shells', sw.includes("if (parsedRequestUrl.searchParams.has('__offline_rsc_shell')) return 8;"));
check('offline RSC warming rejects HTML/login fallbacks instead of poisoning the RSC shell key', /function isUsableOfflineRscResponse\(response: Response\): boolean[\s\S]{0,300}contentType === 'text\/x-component'/.test(routes) && (routes.match(/if \(isUsableOfflineRscResponse\(rscRes\)\)/g) || []).length >= 2);
check('trim prioritizes visited and recovered HTML above warm-only shells',
  /contentType\.includes\('text\/html'\) && \(source === 'visit' \|\| source === 'visit-recovery'\)[\s\S]{0,120}\? 100000/.test(sw));
check('asset verifier accepts single/double quotes and requires every asset response to be usable', sw.includes("html.matchAll(/(?:src|href)=[\"']") && /if \(!isUsableStaticAssetResponse\(url, hit\)\) return false;/.test(sw));
check('asset verifier accepts contentful static HTML but rejects empty shells', sw.includes('if (chunkUrls.length === 0) return /<body') && sw.includes('test(html);'));
check('public and protected hub navigations normalize tab query to one shell', /if \(HUB_PATHS\.has\(url\.pathname\)\) url\.search = ''/.test(sw) && /const cacheKey = hubDocumentKey\(request, url\)/.test(sw));
check('personal shells remain in a dedicated logout-cleared cache', /PERSONAL_SHELL_CACHE/.test(sw) && /caches\.delete\(PERSONAL_SHELL_CACHE\)/.test(sw));
check('authentication pages bypass offline page caching', /if \(isAuthPage\(url\)\)\s*\{\s*return;/.test(sw));
check('cache status inspects actual HTML and assets rather than only metadata', /export async function inspectRouteCache\(/.test(routes) && /missingAssets/.test(routes) && /htmlPresent/.test(routes));
check('regex capture groups are narrowed before Cache API and string calls', (routes.match(/filter\(\(value\): value is string => typeof value === 'string' && value\.length > 0\)/g) || []).length >= 4);
check('visited complete shells are not overwritten by automatic warming', /isFreshVisitCopy/.test(routes) && /keepLatestVisit/.test(routes) && /force \? Number\.MAX_SAFE_INTEGER/.test(routes));
check('route list uses the live cache inspection result', /inspectRouteCaches\(/.test(list) && /missingAssets|complete/.test(list));
check('regression tests cover hard navigation, route-commit shell capture, query privacy, RSC isolation, and visit-priority trimming', /caches HTML and dependencies on a full-document navigation/.test(tests) && /committed SPA visit then stores its HTML shell/.test(tests) && /private search.location route commits/.test(tests) && /drops legacy Flight payloads/.test(tests) && /visited shell ahead of warm-only pages/.test(tests));
check('SW and TypeScript cache versions are synchronized', (() => {
  const swVersion = sw.match(/const CACHE_VERSION\s*=\s*['"]v(\d+)['"]/);
  const tsVersion = read('lib/cacheVersion.ts').match(/CACHE_VERSION\s*=\s*['"]v(\d+)['"]/);
  return Boolean(swVersion && tsVersion && swVersion[1] === tsVersion[1]);
})());


check('client route commits save actually visited pages, including Next prefetch navigations',
  /if \(type === 'CACHE_VISITED_PAGE'\)/.test(sw) &&
  /async function cacheVisitedPageFromClient\(rawUrl\)/.test(sw) &&
  /VisitedPageShellTracker/.test(read('components/pwa/VisitedPageShellTracker.tsx')));
check('private search and location query strings are not stored as shared HTML shells',
  /function hasPrivateOfflineDocumentQuery\(url\)/.test(sw) &&
  /htmlCacheName === STATIC_CACHE && hasPrivateOfflineDocumentQuery\(docUrl\)/.test(sw) &&
  /: !hasPrivateOfflineDocumentQuery\(url\)/.test(sw));

// ── Durability guardrails (shell retry / redirects / migration / persist / stale grace) ──
check('failed shell saves are queued for retry (pending store + sync/online/activate triggers)',
  /const SHELL_PENDING_KEY/.test(sw) && /async function retryPendingShells\(\)/.test(sw) &&
  /event\.tag === SHELL_RETRY_SYNC_TAG/.test(sw) && /type === 'RETRY_PENDING_SHELLS'/.test(sw) &&
  /await self\.clients\.claim\(\);\s*retryPendingShells\(\)\.catch\(\(\) => \{\}\);/.test(sw));
check('retry does not burn attempts while offline and gives up after a bounded number of attempts',
  /self\.navigator\?\.onLine === false\) return;/.test(sw) && /SHELL_PENDING_MAX_ATTEMPTS = 5/.test(sw));
check('redirected documents are cached under the final URL only when same-origin and not auth/admin/protected-bucket mismatch',
  /if \(response\.redirected\)/.test(sw) && /isAuthPage\(finalUrl\)/.test(sw) && /isPersonalShellRoute\(finalUrl\)/.test(sw) && /targetUrl = finalUrl;/.test(sw));
check('shell migration keeps allowed personal HTML and rejects all legacy Flight payloads',
  /const isRscKey = url\.searchParams\.has\('_rsc'\) \|\| url\.searchParams\.has\('__offline_rsc_shell'\)/.test(sw) &&
  /if \(isRscKey \|\| url\.pathname\.startsWith\('\/_next\/'\) && !isStaticAsset\) return false;/.test(sw) &&
  /if \(PROTECTED_AD_EDIT_RE\.test\(url\.pathname\) \|\| !isPersonalShellRoute\(url\)\) return false;\s*return isHtml;/.test(sw));
check('migration keeps the most recent visited shells and the chunks they reference',
  /SHELL_MIGRATION_KEEP_PUBLIC/.test(sw) && /SHELL_MIGRATION_KEEP_PERSONAL/.test(sw) && /neededAssetPaths/.test(sw));
check('stale API grace is limited to shared public snapshots and can be disabled with STALE_API_GRACE_MS = 0',
  /const STALE_API_GRACE_MS = /.test(sw) && /!\(STALE_API_GRACE_MS > 0\)/.test(sw) &&
  (sw.match(/asStaleApiSnapshotIfInGrace\(url, cached(?:Api|Core)\)/g) || []).length === 4 &&
  !/asStaleApiSnapshotIfInGrace\(url, cached(?:UserData|ForUser)\)/.test(sw));
check('persistent storage is requested only from an explicit offline-settings action',
  !read('components/pwa/OfflineBootstrap.tsx').includes('ensurePersistentStorage') &&
  read('components/settings/OfflineControlClient.tsx').includes('requestPersistentStorageFromUserGesture') &&
  /navigator\.storage\.persist\(\)/.test(read('lib/offlineStoragePressure.ts')));

if (failures.length) {
  console.error(`[offline-cache-truth] ${failures.length} failure(s), ${passed} passed`);
  process.exitCode = 1;
} else {
  console.log(`[offline-cache-truth] ${passed}/${passed} checks passed`);
}
