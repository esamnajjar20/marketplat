import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const monitor = read('lib/networkRequestMonitor.ts');
const panel = read('components/admin/AdminNetworkRequestsPanel.tsx');
const homepage = read('hooks/queries/useHomeFeed.ts');
const storefront = read('components/stores/StoreStorefront.tsx');
const batchRouter = read('../apps/api/src/shared/utils/readBatchRouter.ts');
const apiRoutes = read('../apps/api/src/routes.ts');
const apiApp = read('../apps/api/src/app.ts');
const packageJson = JSON.parse(read('package.json'));

function collectSources(directory, files = []) {
  const absolute = path.join(root, directory);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSources(relative, files);
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

const appSources = ['app', 'components', 'hooks'].flatMap((directory) => collectSources(directory));
const batchCallSites = appSources.filter((file) => /apiClient\.batchGet\s*\(/.test(read(file)));
const checks = [
  ['Fetch captures Content-Length without reading response bodies', /parseContentLengthHeader\(response\.headers\.get\('Content-Length'\)\)/.test(monitor)],
  ['XHR captures Content-Length without reading response bodies', /parseContentLengthHeader\(this\.getResponseHeader\('Content-Length'\)\)/.test(monitor)],
  ['unknown response sizes stay unknown in route summaries', /sizedResponseCount/.test(monitor) && /knownResponseBytes/.test(monitor)],
  ['route summaries include latency percentiles and cache hit rate', /p50DurationMs/.test(monitor) && /p95DurationMs/.test(monitor) && /p99DurationMs/.test(monitor) && /cacheHitRate/.test(monitor)],
  ['request panel reports cache hit rate and route-level P95', /معدل إصابة الكاش/.test(panel) && /item\.p95DurationMs/.test(panel) && /item\.cacheHitRate/.test(panel)],
  ['filtered network metrics use the filtered request sample', /summarizeDurations\(filtered\.map/.test(panel)],
  ['admin panel exposes per-route request, failure, cancellation, latency and size coverage', /summarizeNetworkRequestsByRoute/.test(panel) && /failedCount/.test(panel) && /abortedCount/.test(panel) && /averageDurationMs/.test(panel) && /sizedResponseCount/.test(panel) && /concurrentDuplicateCount/.test(panel)],
  ['home feed selects one aggregate endpoint per identity state', /identity\s*\?\s*homeFeedApi\.get\(/.test(homepage) && /:\s*homeFeedApi\.getStatic\(/.test(homepage) && !/Promise\.all/.test(homepage)],
  ['storefront loads only its active tab instead of preloading every tab', /active === 'products'/.test(storefront) && /active === 'ads'/.test(storefront) && /active === 'reviews'/.test(storefront) && /dynamic\(/.test(storefront)],
  ['read batch remains explicit and bounded to eight allow-listed relative GETs', /MAX_BATCH_SIZE = 8/.test(batchRouter) && /isAllowedPath\(row\.url\)/.test(batchRouter) && /Only allowlisted relative GET routes/.test(batchRouter)],
  ['batch subrequests execute in parallel and retain downstream route middleware', /Promise\.allSettled\(items\.map/.test(batchRouter) && /\)\.handle\(child, response, done\)/.test(batchRouter)],
  ['batch endpoint is explicitly registered as opt-in transport', /router\.post\('\/batch', CACHE\.NONE, createReadBatchHandler\(router\)\)/.test(apiRoutes)],
  ['API exposes X-Cache for the diagnostic panel', /exposedHeaders:\s*\[[^\]]*'X-Cache'/.test(apiApp)],
  ['no unmeasured batchGet callsites were added to application UI', batchCallSites.length === 0],
  ['phase-3 audit is registered in package scripts', packageJson.scripts['network:phase3-audit'] === 'node scripts/http-request-phase3-audit.mjs && node scripts/network-request-monitor-audit.mjs'],
];

let failed = 0;
for (const [name, pass] of checks) {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}\n`);
  if (!pass) failed++;
}
process.stdout.write(`HTTP request phase 3 audit: ${checks.length - failed}/${checks.length} passed; ${batchCallSites.length} application batchGet callsites.\n`);
assert.equal(failed, 0, `${failed} phase-3 audit checks failed`);
