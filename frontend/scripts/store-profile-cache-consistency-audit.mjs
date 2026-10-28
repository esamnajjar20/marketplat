#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const keys = fs.readFileSync(new URL('../lib/queryKeys.ts', import.meta.url), 'utf8');
const invalidation = fs.readFileSync(new URL('../lib/queryInvalidation.ts', import.meta.url), 'utf8');
const mutations = fs.readFileSync(new URL('../hooks/mutations/useStoreMutations.ts', import.meta.url), 'utf8');
const helper = invalidation.split('export async function invalidateStoreProfileCaches')[1]?.split('/** Target service-listing')[0] ?? '';
const profileMutationBlock = mutations.split('/**\n * POST /stores/:id/follow')[0];
const checks = [
  ['store list has a dedicated invalidation prefix', /listRoot:\s*\(\)\s*=> \['stores', 'list'\]/.test(keys)],
  ['infinite store list has a dedicated invalidation prefix', /infiniteRoot:\s*\(\)\s*=> \['stores', 'infinite'\]/.test(keys)],
  ['profile invalidation refreshes public lists', /queryKeys\.stores\.listRoot\(\)/.test(helper)],
  ['profile invalidation refreshes infinite lists', /queryKeys\.stores\.infiniteRoot\(\)/.test(helper)],
  ['profile invalidation refreshes homepage snapshots', /queryKeys\.home\.pageRoot\(\)/.test(helper)],
  ['known store detail is invalidated narrowly', /if \(storeId\) jobs\.push\(queryClient\.invalidateQueries\(\{ queryKey: queryKeys\.stores\.detail\(storeId\) \}\)\)/.test(helper)],
  ['store profile update uses targeted invalidation', /useUpdateStore[\s\S]*?invalidateStoreProfileCaches\(queryClient, store\?\.id\)/.test(profileMutationBlock)],
  ['logo upload updates own-store cache from server response', /useUploadStoreLogo[\s\S]*?setQueryData\(queryKeys\.stores\.me\(\), store\)/.test(profileMutationBlock)],
  ['cover upload uses targeted invalidation', /useUploadStoreCover[\s\S]*?invalidateStoreProfileCaches\(queryClient, store\?\.id\)/.test(profileMutationBlock)],
  ['profile mutations avoid broad stores-root invalidation', !/invalidateQueries\(\{ queryKey: queryKeys\.stores\.all\(\) \}\)/.test(profileMutationBlock)],
];
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  assert.ok(passed, label);
}
console.log(`\n${checks.length}/${checks.length} store profile cache consistency checks passed.`);
