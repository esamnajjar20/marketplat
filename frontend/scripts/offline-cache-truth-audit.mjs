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

check('network-first handler derives the request URL locally (no free url variable)', /async function networkFirstPage\(event, request, cacheKey\)\s*\{\s*const url = new URL\(request\.url\);/.test(sw));
check('hard document visits trigger HTML plus initial asset capture', /if \(isHtmlVisit\)[\s\S]{0,300}cacheVisitedDocumentShell\(url, cache, response\.clone\(\), STATIC_CACHE\)/.test(sw));
check('real RSC navigation captures a separate HTML shell', /if \(isRealRscNavigation\(request\)\)\s*\{\s*event\.waitUntil\(cacheVisitedDocumentShell\(url, cache, undefined, STATIC_CACHE\)\);/.test(sw));
check('late responses after weak-network timeout also capture the visited document', /if \(isRealRscNavigation\(request\)\) await cacheVisitedDocumentShell\(url, cache, undefined, STATIC_CACHE\);/.test(sw));
check('HTML cache writes remove Vary and mark actual visits', /putTimestamped\(htmlCache, cacheKey, await stripVaryAndClone\(response\), 'visit'\)/.test(sw));
check('activation migrates legacy cached HTML with Vary without deleting user caches', /async function normalizeExistingHtmlCache\(cacheName\)/.test(sw) && /normalizeExistingHtmlCache\(STATIC_CACHE\)/.test(sw) && /normalizeExistingHtmlCache\(PERSONAL_SHELL_CACHE\)/.test(sw));
check('initial assets are marked and prioritized with their visited page', /putTimestamped\(staticCache, item\.assetUrl, item\.asset, 'visit-asset'\)/.test(sw) && /source === 'visit-asset' \? 160000/.test(sw));
check('HTML is committed only after all initial assets pass MIME/status verification', /isUsableStaticAssetResponse\(assetUrl, asset\)/.test(sw) && /await htmlCache\.delete\(cacheKey\)/.test(sw) && /isUsableStaticAssetResponse\(url, res\)/.test(routes));
check('route completeness validates JavaScript/CSS MIME types, not only cache-key presence', /contentType === 'text\/css'/.test(routes) && /contentType\.includes\('javascript'\)/.test(routes) && /isUsableStaticAssetResponse\(url, await staticCache\.match\(url\)\)/.test(routes));
check('single-route deletion scans actual HTML in both caches before deleting shared chunks', /const targetAssets = new Set<string>/.test(routes) && /new Set\(\[STATIC_CACHE, PERSONAL_SHELL_CACHE\]\)/.test(routes) && /sharedChunks\.has\(asset\)/.test(routes));
check('RSC payloads do not consume the priority reserved for HTML route shells', sw.includes("if (parsedRequestUrl.searchParams.has('__offline_rsc_shell')) return 8;"));
check('trim prioritizes visited HTML above warm-only shells', /contentType\.includes\('text\/html'\) && source === 'visit'[\s\S]{0,120}\? 100000/.test(sw));
check('asset verifier accepts single/double quotes and requires every asset response to be usable', sw.includes("html.matchAll(/(?:src|href)=[\"']") && /if \(!isUsableStaticAssetResponse\(url, hit\)\) return false;/.test(sw));
check('asset verifier rejects unverifiable empty HTML shells', /if \(chunkUrls\.length === 0\) return false;/.test(sw));
check('public and protected hub navigations normalize tab query to one shell', (sw.match(/hubDocumentKey\(request, url\)/g) || []).length >= 2);
check('personal shells remain in a dedicated logout-cleared cache', /PERSONAL_SHELL_CACHE/.test(sw) && /caches\.delete\(PERSONAL_SHELL_CACHE\)/.test(sw));
check('authentication pages bypass offline page caching', /if \(isAuthPage\(url\)\)\s*\{\s*return;/.test(sw));
check('cache status inspects actual HTML and assets rather than only metadata', /export async function inspectRouteCache\(/.test(routes) && /missingAssets/.test(routes) && /htmlPresent/.test(routes));
check('regex capture groups are narrowed before Cache API and string calls', (routes.match(/filter\(\(value\): value is string => typeof value === 'string' && value\.length > 0\)/g) || []).length >= 4);
check('visited complete shells are not overwritten by automatic warming', /isFreshVisitCopy/.test(routes) && /keepLatestVisit/.test(routes) && /force \? Number\.MAX_SAFE_INTEGER/.test(routes));
check('route list uses the live cache inspection result', /inspectRouteCaches\(/.test(list) && /missingAssets|complete/.test(list));
check('regression tests cover hard navigation, RSC navigation, and visit-priority trimming', /caches HTML and dependencies on a full-document navigation/.test(tests) && /successful real RSC navigation/.test(tests) && /visited shell ahead of warm-only pages/.test(tests));
check('SW and TypeScript cache versions are synchronized', (() => {
  const swVersion = sw.match(/const CACHE_VERSION\s*=\s*['"]v(\d+)['"]/);
  const tsVersion = read('lib/cacheVersion.ts').match(/CACHE_VERSION\s*=\s*['"]v(\d+)['"]/);
  return Boolean(swVersion && tsVersion && swVersion[1] === tsVersion[1]);
})());

if (failures.length) {
  console.error(`[offline-cache-truth] ${failures.length} failure(s), ${passed} passed`);
  process.exitCode = 1;
} else {
  console.log(`[offline-cache-truth] ${passed}/${passed} checks passed`);
}
