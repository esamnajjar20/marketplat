#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const querySource = fs.readFileSync(new URL('../hooks/queries/useStores.ts', import.meta.url), 'utf8');
const mutationSource = fs.readFileSync(new URL('../hooks/mutations/useStoreMutations.ts', import.meta.url), 'utf8');
const checks = [
  ['membership cache is written only by the canonical limit-100 query', /if \(!data \|\| params\?\.limit !== 100\) return;/.test(querySource)],
  ['canonical membership refresh replaces the Set rather than merging stale IDs', /setQueryData<Set<string>>\([\s\S]{0,120}new Set\(data\.items\.map\(\(row\) => row\.storeId\)\)/.test(querySource)],
  ['paginated list queries cannot union partial pages into the membership Set', /params\?\.limit !== 100/.test(querySource) && !/const idSet = new Set\(prev \?\? \[\]\);\s*data\.items\.forEach\(\(row\) => idSet\.add\(row\.storeId\)\)/.test(querySource)],
  ['follow toggle writes server-confirmed action into membership Set', /if \(data\?\.action === 'followed'\) idSet\.add\(storeId\); else idSet\.delete\(storeId\);/.test(mutationSource)],
  ['follow toggle invalidates followed-store query family after server success', /invalidateQueries\(\{ queryKey: queryKeys\.stores\.followed\(\) \}\)/.test(mutationSource)],
];
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  assert.ok(passed, label);
}
console.log(`\n${checks.length}/${checks.length} followed-store cache consistency checks passed.`);
