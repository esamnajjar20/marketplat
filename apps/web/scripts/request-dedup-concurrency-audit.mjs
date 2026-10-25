import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const client = read('api/client.ts');
const prefetch = read('lib/prefetch.ts');
const intent = read('lib/prefetchOnIntent.ts');

const checks = [
  ['GET dedupe key is bound to current user and session-cleanup version', /const userId = useAuthStore\.getState\(\)\.user\?\.id \?\? 'anonymous'[\s\S]*session:\$\{getSessionCleanupVersion\(\)\}/.test(client)],
  ['GET requests with caller AbortSignal bypass shared in-flight promise', /if \(config\?\.signal \|\| responseType === 'blob' \|\| responseType === 'arraybuffer'\) \{\s*return rawGet\(url, config\);/.test(client)],
  ['blob and arraybuffer requests bypass dedupe', /responseType === 'blob' \|\| responseType === 'arraybuffer'/.test(client)],
  ['in-flight GET entry is removed only if it still points to that request', /finally\(\(\) => \{\s*if \(inflightGetRequests\.get\(key\) === request\) inflightGetRequests\.delete\(key\);/.test(client)],
  ['detail-prefetch cleanup handles fulfilled and rejected promises without bare finally', /void promise\.then\(release, release\)/.test(prefetch) && !/void promise\.finally\(/.test(prefetch)],
  ['detail-prefetch cleanup guards against deleting a newer promise', /if \(adDetailPromises\.get\(id\) === promise\) adDetailPromises\.delete\(id\)/.test(prefetch)],
  ['intent prefetch rechecks network policy after idle scheduling', /runWhenIdle\(\(\) => \{[\s\S]*if \(!canPrefetch\(\)\)/.test(intent)],
  ['intent prefetch concurrency is bounded by current network policy', /activePrefetches >= policy\.maxPrefetchConcurrency/.test(intent) && /activePrefetches >= currentPolicy\.maxPrefetchConcurrency/.test(intent)],
  ['intent prefetch always releases active slot on settle', /\.finally\(\(\) => \{\s*activePrefetches = Math\.max\(0, activePrefetches - 1\);/.test(intent)],
];

let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed++;
}
console.log(`Request dedup/concurrency audit: ${checks.length - failed}/${checks.length} passed`);
assert.equal(failed, 0, `${failed} audit checks failed`);
