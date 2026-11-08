#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const querySource = fs.readFileSync(new URL('../hooks/queries/useStores.ts', import.meta.url), 'utf8');
const mutationSource = fs.readFileSync(new URL('../hooks/mutations/useStoreMutations.ts', import.meta.url), 'utf8');
const followsSource = fs.readFileSync(new URL('../hooks/queries/useFollows.ts', import.meta.url), 'utf8');
const keySource = fs.readFileSync(new URL('../lib/queryKeys.ts', import.meta.url), 'utf8');
const checks = [
  ['store detail reads one target through useFollowStatus', /useFollowStatus\('STORE', storeId\)/.test(querySource)],
  ['store detail no longer mounts the full followed-stores list query', !/useMyFollowedStores\(\{\s*limit:\s*100\s*\}\)/.test(querySource)],
  ['generic follow status forwards an AbortSignal to the one-target API', /followsApi\.status\(targetType, targetId, \{ signal \}\)/.test(followsSource)],
  ['store toggle writes a boolean status for immediate button feedback', /setQueryData<boolean>\([\s\S]{0,120}queryKeys\.follows\.status\('STORE', storeId\)[\s\S]{0,120}data\?\.action === 'followed'/.test(mutationSource)],
  ['store toggle invalidates the followed-store list after server success', /invalidateQueries\(\{ queryKey: queryKeys\.stores\.followed\(\) \}\)/.test(mutationSource)],
  ['obsolete full-membership Set key is removed', !/followedIds:/.test(keySource)],
];
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  assert.ok(passed, label);
}
console.log(`\n${checks.length}/${checks.length} follow-status request reduction checks passed.`);
