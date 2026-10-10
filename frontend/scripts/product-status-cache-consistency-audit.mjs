import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mutations = readFileSync(new URL('../hooks/mutations/useProductMutations.ts', import.meta.url), 'utf8');
const invalidation = readFileSync(new URL('../lib/queryInvalidation.ts', import.meta.url), 'utf8');
const keys = readFileSync(new URL('../lib/queryKeys.ts', import.meta.url), 'utf8');

const checks = [
  ['status mutation cancels outstanding product queries before optimistic writes', /onMutate:[\s\S]*?cancelQueries\(\{ queryKey: queryKeys\.products\.all\(\) \}\)[\s\S]*?getQueriesData/.test(mutations)],
  ['optimistic update includes list, infinite, promoted, owner, and detail cache namespaces', /\['list',\s*'infinite',\s*'promoted',\s*'me',\s*'detail'\]/.test(mutations)],
  ['cache updater handles arrays and nested pagination payloads', /Array\.isArray\(value\)[\s\S]*?updateProductStatusInCache\(item[\s\S]*?Object\.entries\(record\)/.test(mutations)],
  ['cache updater preserves references when no matching product changed', /if \(!changed\) return value/.test(mutations)],
  ['rollback restores snapshots after failed status mutation', /onError:[\s\S]*?context\?\.snapshots\.forEach\(\(\[key, data\]\) => queryClient\.setQueryData\(key, data\)\)/.test(mutations)],
  ['settled status mutation invalidates browse and exact detail caches', /onSettled:[\s\S]*?invalidateProductBrowseCaches\(queryClient, \{ productId: variables\?\.id, includeStock: true \}\)/.test(mutations)],
  ['browse invalidation includes public list and infinite caches', /queryKeys\.products\.listRoot\(\)/.test(invalidation) && /queryKeys\.products\.infiniteRoot\(\)/.test(invalidation)],
  ['browse invalidation includes promoted and owner caches', /queryKeys\.products\.promotedRoot\(\)/.test(invalidation) && /queryKeys\.products\.mineRoot\(\)/.test(invalidation)],
  ['browse invalidation includes homepage and exact detail caches', /queryKeys\.home\.pageRoot\(\)/.test(invalidation) && /queryKeys\.products\.detail\(options\.productId\)/.test(invalidation)],
  ['product query key root is shared and stable', /all:\s*\(\)\s*=>\s*\['products'\]/.test(keys)],
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (!pass) failed++;
}
console.log(`${checks.length - failed}/${checks.length} checks passed`);
assert.equal(failed, 0, `${failed} product cache consistency checks failed`);
