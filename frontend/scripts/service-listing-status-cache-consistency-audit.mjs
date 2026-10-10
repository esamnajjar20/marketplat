import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mutations = readFileSync(new URL('../hooks/mutations/useServiceListingMutations.ts', import.meta.url), 'utf8');
const invalidation = readFileSync(new URL('../lib/queryInvalidation.ts', import.meta.url), 'utf8');
const keys = readFileSync(new URL('../lib/queryKeys.ts', import.meta.url), 'utf8');

const checks = [
  ['service status mutation cancels all service-listing queries before optimistic writes', /onMutate:[\s\S]*?cancelQueries\(\{ queryKey: queryKeys\.serviceListings\.all\(\) \}\)[\s\S]*?getQueriesData/.test(mutations)],
  ['status mutation covers public lists, infinite pages, owner lists, and details', /\['list',\s*'infinite',\s*'me',\s*'detail'\]/.test(mutations)],
  ['recursive updater handles nested infinite-query pages and arrays', /Array\.isArray\(value\)[\s\S]*?updateServiceListingStatusInCache\(item[\s\S]*?Object\.entries\(record\)/.test(mutations)],
  ['recursive updater preserves unchanged cache references', /if \(!changed\) return value/.test(mutations)],
  ['previous status is read from cache before optimistic update', /const snapshots =[\s\S]*?const previousStatus = snapshots[\s\S]*?findServiceListingStatusInCache/.test(mutations)],
  ['failed toggle rolls back only the affected listing across cache namespaces', /onError:[\s\S]*?updateServiceListingStatusInCache\(data, variables\.id, context\.previousStatus\)/.test(mutations)],
  ['rollback avoids overwriting another pending toggle for the same listing', /anotherToggleForSameListingIsPending[\s\S]*?if \(!anotherToggleForSameListingIsPending/.test(mutations)],
  ['settled mutation invalidates listing browse and exact detail caches', /onSettled:[\s\S]*?invalidateServiceListingCaches\(queryClient, variables\?\.id\)/.test(mutations)],
  ['service browse invalidation refreshes list, infinite, owner, and homepage snapshots', /invalidateServiceListingCaches[\s\S]*?queryKeys\.serviceListings\.listRoot\(\)[\s\S]*?queryKeys\.serviceListings\.infiniteRoot\(\)[\s\S]*?queryKeys\.serviceListings\.mineRoot\(\)[\s\S]*?queryKeys\.home\.pageRoot\(\)/.test(invalidation)],
  ['service listing detail and collection keys share a stable namespace', /all:\s*\(\)\s*=>\s*\['service-listings'\]/.test(keys) && /detail:\s*\(id: string\)\s*=>\s*\['service-listings',\s*'detail',\s*id\]/.test(keys)],
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (!pass) failed++;
}
console.log(`${checks.length - failed}/${checks.length} checks passed`);
assert.equal(failed, 0, `${failed} service listing cache consistency checks failed`);
