#!/usr/bin/env node
/** Dependency-free audit for canonical cache policy and generated runtime artifacts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const policy = json('shared/cache-policy.json');
const contract = json('shared/cache/cache-contract.json');
assert.equal(policy.version, 2, 'expected canonical cache policy v2');
assert.equal(contract.version, 3, 'expected cache contract v3');
assert.equal(contract.keyAlgorithmVersion, 1, 'cache key algorithm remains v1');

const policyText = `${JSON.stringify(policy, null, 2)}\n`;
const contractText = `${JSON.stringify(contract, null, 2)}\n`;
for (const file of ['frontend/lib/cache-policy.json', 'apps/api/src/shared/cache/cache-policy.json']) {
  assert.equal(read(file), policyText, `${file} is stale; run pnpm cache:sync`);
}
for (const file of ['frontend/lib/cache/cache-contract.json', 'apps/api/src/shared/cache/cache-contract.json']) {
  assert.equal(read(file), contractText, `${file} is stale; run pnpm cache:sync`);
}
assert.equal(
  read('frontend/public/cache-policy.js'),
  `/* generated from shared/cache-policy.json — do not edit */\nself.MARKET_CACHE_POLICY = ${JSON.stringify(policy)};\n`,
  'Service Worker cache policy is stale',
);
assert.equal(
  read('frontend/public/cache-contract.js'),
  `/* generated from shared/cache/cache-contract.json — do not edit */\nself.MARKET_CACHE_CONTRACT = ${JSON.stringify(contract, null, 2)};\n`,
  'Service Worker cache contract is stale',
);
assert.equal(
  read('workers/cf-api-proxy/src/cachePolicy.generated.ts'),
  `/* generated from shared/cache-policy.json — do not edit */\nexport const GENERATED_CACHE_POLICY = ${JSON.stringify(policy, null, 2)} as const;\n`,
  'Cloudflare Worker cache policy is stale',
);
assert.equal(
  read('apps/mobile/src/cachePolicy.generated.ts'),
  `/* generated from shared/cache-policy.json — do not edit */\nexport const MOBILE_CACHE_POLICY = ${JSON.stringify(policy, null, 2)} as const;\n`,
  'Mobile cache policy is stale',
);
const cacheKey = read('shared/cache/cacheKey.ts');
assert.equal(read('frontend/lib/cache/cacheKey.ts'), cacheKey, 'frontend cache-key copy is stale');
assert.equal(read('apps/api/src/shared/cache/cacheKey.ts'), cacheKey, 'API cache-key copy is stale');

assert.equal(contract.domains.userProfile.scope, 'private', 'user profile cache must remain private');
for (const name of ['personal', 'messages', 'security', 'privateUserProfile']) {
  assert.equal(policy[name].http.maxAgeSec, 0, `${name} must not become publicly HTTP cacheable`);
}
assert.ok(contract.mobileMutationInvalidation.length >= 15, 'mobile mutation invalidation rules are incomplete');
assert.ok(Object.keys(contract.publicMutationTags.resources).length >= 15, 'public mutation tag map is incomplete');
assert.ok(contract.publicReadTags.paths.length >= 10, 'public read tag map is incomplete');
for (const rule of contract.mobileMutationInvalidation) {
  assert.ok(rule.route.startsWith('^/api/v1/'), `invalid mobile route regex: ${rule.route}`);
  assert.ok(Array.isArray(rule.privatePrefixes) && Array.isArray(rule.publicPrefixes));
}

const serviceWorker = read('frontend/public/sw.js');
for (const [constant, key] of [
  ['MAX_API_ENTRIES', 'apiEntries'],
  ['MAX_IMAGE_ENTRIES', 'imageEntries'],
  ['MAX_SAVED_ADS_ENTRIES', 'savedAdsEntries'],
  ['MAX_STATIC_ENTRIES', 'staticEntries'],
  ['MAX_STATIC_BYTES', 'staticBytes'],
  ['MAX_PERSONAL_SHELL_ENTRIES', 'personalShellEntries'],
  ['MAX_USER_DATA_ENTRIES', 'userDataEntries'],
  ['MAX_USER_DATA_BYTES', 'userDataBytes'],
]) {
  const match = serviceWorker.match(new RegExp(`const ${constant} = MARKET_STORAGE_POLICY\\.${key} \\?\\? (\\d+);`));
  assert.ok(match, `Service Worker fallback for ${constant} is missing`);
  assert.equal(Number(match[1]), policy.storage.serviceWorker[key], `Service Worker fallback ${constant} drifted`);
}

const queryClient = read('frontend/lib/queryClient.ts');
assert.ok(queryClient.includes('CACHE_POLICY.queryDefaults'), 'React Query defaults must use the canonical policy');
const mobileApi = read('apps/mobile/src/api/client.ts');
assert.ok(mobileApi.includes("../../../../shared/cache/cache-contract.json"), 'mobile mutation invalidation must import the canonical contract');
assert.ok(mobileApi.includes('cacheContract.mobileMutationInvalidation.map'), 'mobile mutation invalidation must be contract-driven');
for (const source of [
  'apps/mobile/src/storage/public-cache-policy.ts',
  'apps/mobile/src/storage/public-image-cache-policy.ts',
]) assert.ok(source && read(source).includes("cachePolicy.generated"), `${source} must consume generated shared policy`);
const apiCacheSources = [
  ['apps/api/src/modules/discovery/recommendations/recommendations.cache.ts', "cachePolicy('recommendations').server"],
  ['apps/api/src/modules/discovery/search/search.service.ts', 'CACHE_POLICY.server.searchSuggestions'],
  ['apps/api/src/shared/cache/userCache.ts', "cachePolicy('personal').server"],
  ['apps/api/src/shared/cache/unreadNotificationsCache.ts', "cachePolicy('messages').server"],
  ['apps/api/src/shared/cache/warmedListQueries.ts', "cachePolicy('publicLive').server.warmedListHardTtlSec"],
  ['apps/api/src/shared/cache/referenceDataTtl.ts', 'CACHE_POLICY.server.referenceTreeTtlSec'],
];
for (const [file, marker] of apiCacheSources) {
  assert.ok(read(file).includes(marker), `${file} must use the shared cache policy`);
}
// Cache freshness/garbage-collection durations must be policy-backed, not re-authored in hooks.
function walkTypeScript(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', '__tests__', 'test', 'tests', 'test-support', 'e2e'].includes(entry.name)) continue;
      walkTypeScript(rel, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}
const inlineCacheDurations = [];
for (const file of walkTypeScript('frontend')) {
  const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[\t ]*\/\/.*$/gm, '');
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/\b(?:staleTime|gcTime)\s*:\s*(?:\d[\d_]*(?:\s*(?:\*|\/|\+|-)\s*\d[\d_]*)*|Infinity)\b/.test(line)) {
      inlineCacheDurations.push(`${file}:${index + 1}`);
    }
  });
}
assert.deepEqual(inlineCacheDurations, [], `inline React Query durations found: ${inlineCacheDurations.join(', ')}`);

const frontendConstants = read('frontend/lib/constants.ts');
assert.ok(frontendConstants.includes("cachePolicy('queryDefaults').searchSuggestions.staleTimeMs"), 'frontend feature TTLs must use shared queryDefaults');
assert.ok(read('apps/api/src/shared/cache/publicMutationTags.ts').includes('CACHE_CONTRACT.publicMutationTags'), 'API mutation tags must use the shared contract');
assert.ok(read('frontend/lib/server/serverCacheTags.ts').includes('contract.publicReadTags'), 'frontend read tags must use the shared contract');
const worker = read('workers/cf-api-proxy/worker.ts');
assert.ok(worker.includes("import { GENERATED_CACHE_POLICY } from './src/cachePolicy.generated'"));
assert.ok(worker.includes('EDGE_CACHE_POLICY.reference.mutableMaxAgeSec'));

console.log(`[cache-policy-audit] PASS policy=v${policy.version} contract=v${contract.version} domains=${Object.keys(contract.domains).length} mobileRules=${contract.mobileMutationInvalidation.length}`);
console.log('[cache-policy-audit] PASS web/API/mobile/Service Worker/Cloudflare consume generated or canonical cache policy');
console.log('[cache-policy-audit] PASS private HTTP cache invariants preserved');
