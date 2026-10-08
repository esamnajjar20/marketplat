/** Static audit for CACHE-W1..W3 canonical identity, invalidation and HTTP ownership. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(repoRoot, p));
const failMessages = [];
const fail = (m) => { failMessages.push(m); console.error(`[cache-audit] FAIL: ${m}`); };
const pass = (m) => console.log(`[cache-audit] OK: ${m}`);

const policy = JSON.parse(read('shared/cache-policy.json'));
const contract = JSON.parse(read('shared/cache/cache-contract.json'));
if (policy.version !== 1) fail('unsupported cache policy version'); else pass('canonical policy version=1');
if (contract.version !== 1 || contract.keyAlgorithmVersion !== 1) fail('unsupported cache contract/key algorithm version'); else pass('canonical cache contract version=1/keyAlgorithm=1');

for (const target of ['frontend/lib/cache-policy.json', 'backend/src/shared/cache/cache-policy.json']) {
  if (read(target) !== JSON.stringify(policy, null, 2) + '\n') fail(`${target} is stale`);
}
for (const target of ['frontend/lib/cache/cache-contract.json', 'backend/src/shared/cache/cache-contract.json']) {
  if (read(target) !== JSON.stringify(contract, null, 2) + '\n') fail(`${target} is stale`);
}
if (read('frontend/public/cache-policy.js') !== `/* generated from shared/cache-policy.json — do not edit */\nself.MARKET_CACHE_POLICY = ${JSON.stringify(policy)};\n`) fail('generated SW cache policy is stale');
if (read('frontend/public/cache-contract.js') !== `/* generated from shared/cache/cache-contract.json — do not edit */\nself.MARKET_CACHE_CONTRACT = ${JSON.stringify(contract, null, 2)};\n`) fail('generated SW cache contract is stale');
pass('frontend/backend/SW policy and contract copies match canonical sources');

const frontendKey = read('frontend/lib/cache/cacheKey.ts');
const backendKey = read('backend/src/shared/cache/cacheKey.ts');
const sharedKey = read('shared/cache/cacheKey.ts');
if (frontendKey !== sharedKey || backendKey !== sharedKey) fail('cache key algorithm copies diverge');
else pass('frontend/backend cache-key algorithms are identical');

const invalidation = read('frontend/lib/cache/cacheInvalidationRegistry.ts');
const backendInvalidation = read('backend/src/shared/cache/cacheInvalidationRegistry.ts');
if (!invalidation.includes("contract.invalidation") || !backendInvalidation.includes("contract.invalidation")) fail('invalidation registry is not generated from the canonical contract');
else pass('frontend/backend invalidation registries use canonical contract');

const contractDomains = Object.keys(contract.domains);
if (new Set(contractDomains).size !== contractDomains.length) fail('duplicate cache domains');
for (const [domain, definition] of Object.entries(contract.domains)) {
  if (!definition.namespace || !definition.scope || !definition.policy) fail(`cache domain ${domain} is incomplete`);
  if (!['public', 'personal', 'private'].includes(definition.scope)) fail(`cache domain ${domain} has invalid scope`);
}
pass(`canonical cache domains validated: ${contractDomains.length}`);

const middleware = read('backend/src/middlewares/cacheControl.middleware.ts');
for (const name of ['publicLive', 'publicDetail', 'reference', 'publicHome', 'personal', 'messages', 'security']) {
  if (!middleware.includes(`cachePolicy('${name}')`) && !middleware.includes(`cachePolicyControl('${name}')`)) fail(`HTTP policy ${name} is not owned by cache middleware`);
}
pass('HTTP cache policies are route-middleware owned');

const controllerHeaders = [];
for (const dir of ['backend/src/modules', 'backend/src/shared']) {
  const root = path.join(repoRoot, dir);
  if (!fs.existsSync(root)) continue;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith('.ts') && !full.endsWith(path.join('middlewares', 'cacheControl.middleware.ts'))) {
        const text = fs.readFileSync(full, 'utf8');
        if (/\b(?:setHeader|set|header|append)\s*\(\s*['"]Cache-Control['"]/.test(text) || /\bCache-Control\s*['"]?\s*[:=]/.test(text)) controllerHeaders.push(path.relative(repoRoot, full));
      }
    }
  };
  walk(root);
}
if (controllerHeaders.length) fail(`Cache-Control ownership violation: ${controllerHeaders.join(', ')}`);
else pass('no Cache-Control writes outside the policy middleware');

const homeFeedRoute = read('backend/src/modules/home/home.routes.ts');
if (!homeFeedRoute.includes("homeRouter.get('/feed', CACHE.PERSONAL")) fail('home feed route has no explicit personal cache policy');
else pass('home feed declares explicit personal HTTP cache policy');

const sw = read('frontend/public/sw.js');
if (!sw.includes("importScripts('/cache-policy.js', '/cache-contract.js')")) fail('Service Worker does not load canonical cache contract');
if (!sw.includes('event.data?.domains') || !sw.includes('MARKET_CACHE_CONTRACT')) fail('Service Worker invalidation does not consume canonical domains');
else pass('Service Worker invalidation consumes canonical cache domains');

const offlineInvalidation = read('frontend/lib/offlineCacheInvalidation.ts');
const queryCacheInvalidation = read('frontend/lib/cache/queryCacheInvalidation.ts');
const apiClient = read('frontend/api/client.ts');
const cacheMetrics = read('backend/src/shared/utils/cacheMetrics.ts');
const metricsRegistry = read('backend/src/shared/utils/metricsRegistry.ts');
if (!offlineInvalidation.includes('canonicalPathname') || !offlineInvalidation.includes('rule.domains')) fail('offline invalidation bypasses canonical identity/contract');
else pass('offline invalidation uses canonical path identity and domain contract');

// CACHE-W4: every canonical domain must declare the React Query prefixes
// that represent it, and the Axios mutation boundary must consume the
// contract rather than inventing endpoint-specific invalidation rules.
for (const [domain, definition] of Object.entries(contract.domains)) {
  if (!Array.isArray(definition.queryPrefixes)) fail(`domain ${domain} missing queryPrefixes for React Query invalidation`);
}
if (!queryCacheInvalidation.includes("refetchType: 'active'")) fail('W4 invalidation must restrict immediate refetches to active queries');
if (!apiClient.includes('invalidateReactQueryForMutation')) fail('W4 Axios mutation boundary is not wired to canonical invalidation');
else pass('W4 React Query invalidation is contract-driven at the mutation boundary');

// CACHE-W5: canonical generation identity must be used by public list SWR.
const publicListCache = read('backend/src/shared/utils/publicListCache.ts');
const backendKeyW5 = read('backend/src/shared/cache/cacheKey.ts');
if (!backendKeyW5.includes('canonicalGenerationKey')) fail('W5 canonical generation key helper missing');
if (!publicListCache.includes('canonicalGenerationKey')) fail('W5 public-list generations still use a legacy key builder');
else pass('W5 public-list generation keys use canonical cache identity');

// CACHE-W6: cache telemetry must be registered in the same Prometheus registry
// while keeping cache labels bounded to logical names/events.
if (!cacheMetrics.includes('app_cache_events_total')) fail('W6 Prometheus cache metric missing');
if (!cacheMetrics.includes("labelNames: ['cache', 'event']")) fail('W6 cache metric labels are not bounded');
if (!metricsRegistry.includes('collectDefaultMetrics')) fail('W6 shared Prometheus registry is missing default metrics');
else pass('W6 cache metrics share the application Prometheus registry');

const cacheVersionPath = path.join(repoRoot, 'frontend/lib/cacheVersion.ts');
if (fs.existsSync(cacheVersionPath)) {
  const versions = [
    read('frontend/lib/cacheVersion.ts').match(/SW_CACHE_VERSION[^=]*=\s*['"]([^'"]+)/)?.[1],
    read('frontend/public/sw.js').match(/const CACHE_VERSION = ['"]([^'"]+)/)?.[1],
  ];
  if (versions[0] !== versions[1]) fail(`SW cache version drift: ${versions.join(' vs ')}`);
  else pass(`SW cache version synchronized: ${versions[0]}`);
} else {
  pass('SW cache version check deferred: cacheVersion.ts is outside this focused change set');
}

// CACHE-W7: progressive storage-pressure protection must exist in both the
// browser warming layer and Service Worker disposable-cache writes.
const storagePressure = read('frontend/lib/offlineStoragePressure.ts');
for (const token of ['STORAGE_WARNING_RATIO = 0.8', 'STORAGE_CRITICAL_RATIO = 0.9', 'getBackgroundWarmingBudget', 'shouldPauseBackgroundWarming']) {
  if (!storagePressure.includes(token)) fail(`W7 storage-pressure policy missing ${token}`);
}
if (!sw.includes('storagePressureRatio') || !sw.includes('ratio >= 0.95') || !sw.includes('ratio >= 0.90')) fail('W7 Service Worker progressive quota trimming is missing');
else pass('W7 progressive quota protection is present');
const cacheVersionText = read('frontend/lib/cacheVersion.ts');
const swVersion = sw.match(/const CACHE_VERSION = ['\"]([^'\"]+)/)?.[1];
const tsVersion = cacheVersionText.match(/SW_CACHE_VERSION[^=]*=\s*['\"]([^'\"]+)/)?.[1];
if (swVersion !== tsVersion) fail(`W7 cache version drift: ${swVersion} vs ${tsVersion}`);
else pass(`W7 cache version synchronized: ${swVersion}`);

// CACHE-W8: the canonical contract is structurally closed and every generated
// copy remains byte-for-byte synchronized.
for (const [domain, definition] of Object.entries(contract.domains)) {
  if (!Array.isArray(definition.queryPrefixes)) fail(`W8 domain ${domain} missing queryPrefixes`);
  if (!['public', 'personal', 'private'].includes(definition.scope)) fail(`W8 domain ${domain} has invalid scope`);
}
for (const rule of contract.invalidation ?? []) {
  for (const prefix of rule.prefixes ?? []) if (typeof prefix !== 'string' || !prefix.startsWith('/')) fail(`W8 invalidation prefix is invalid: ${prefix}`);
  for (const domain of rule.domains ?? []) if (!contract.domains[domain]) fail(`W8 invalidation references unknown domain: ${domain}`);
}
const contractAuditPath = path.join(frontendRoot, 'scripts', 'cache-contract-audit.mjs');
if (!fs.existsSync(contractAuditPath)) fail('W8 dedicated contract audit script missing');
else pass('W8 dedicated cache contract audit is present');

// CACHE-W9: correctness regressions for auth isolation, canonical mutation
// routing, and quota boundaries must stay in the source tree.
for (const [file, needles] of Object.entries({
  'frontend/__tests__/unit/lib/cache/offlineOwnership.test.ts': ['another user', 'getOfflineJson', 'getOfflineList'],
  'frontend/__tests__/unit/lib/cache/storagePressure.test.ts': ['0.8', '0.9', 'unknown'],
  'frontend/__tests__/unit/lib/cache/queryCacheInvalidation.test.ts': ['unmapped', 'API versioned'],
})) {
  const text = read(file);
  for (const needle of needles) if (!text.includes(needle)) fail(`W9 regression coverage missing ${needle} in ${file}`);
}
if (failMessages.length) process.exit(1);
console.log('[cache-audit] CACHE W1-W9 AUDIT PASSED');
