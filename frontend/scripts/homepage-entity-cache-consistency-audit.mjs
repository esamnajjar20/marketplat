import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const keys = readFileSync(new URL('../lib/queryKeys.ts', import.meta.url), 'utf8');
const invalidation = readFileSync(new URL('../lib/queryInvalidation.ts', import.meta.url), 'utf8');
const homepage = readFileSync(new URL('../hooks/queries/useHomepage.ts', import.meta.url), 'utf8');
const adsForHome = readFileSync(new URL('../hooks/queries/useAdsForHome.ts', import.meta.url), 'utf8');
const products = readFileSync(new URL('../hooks/mutations/useProductMutations.ts', import.meta.url), 'utf8');
const ads = readFileSync(new URL('../hooks/mutations/useAdMutations.ts', import.meta.url), 'utf8');

const checks = [
  ['homepage has a dedicated prefix key for scoped city payloads', /pageRoot:\s*\(\)\s*=>\s*\['home',\s*'page'\]/.test(keys) && /page:\s*\(city\?: string\)\s*=>\s*\['home',\s*'page',\s*city \?\? null\]/.test(keys)],
  ['ad browse invalidation refreshes embedded homepage snapshots', /invalidateAdBrowseCaches[\s\S]*?queryKeys\.home\.pageRoot\(\)/.test(invalidation)],
  ['product browse invalidation refreshes embedded homepage snapshots', /invalidateProductBrowseCaches[\s\S]*?queryKeys\.home\.pageRoot\(\)/.test(invalidation)],
  ['homepage seeding populates product section list caches', /queryKeys\.products\.list\(p\)/.test(homepage) && /belowFold\.recentProducts/.test(homepage) && /belowFold\.promotedProducts/.test(homepage)],
  ['home ads consumer can return payload data without list query', /home\.data\?\.adsForHome/.test(adsForHome) && /if \(hasSeed\)/.test(adsForHome)],
  ['product mutations use shared product browse invalidation helper', /invalidateProductBrowseCaches\(queryClient/.test(products)],
  ['ad mutations use shared ad browse invalidation helper', /invalidateAdBrowseCaches\(queryClient/.test(ads)],
  ['invalidation is scoped to home payload prefix, not all home feeds', /queryKeys\.home\.pageRoot\(\)/.test(invalidation) && !/invalidateQueries\(\{\s*queryKey:\s*queryKeys\.home\.feed/.test(invalidation)],
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (!pass) failed++;
}
console.log(`${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
