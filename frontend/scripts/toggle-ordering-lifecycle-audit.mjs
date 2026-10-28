import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const queue = read('lib/serialMutationQueue.ts');
const favorites = read('hooks/mutations/useFavoriteMutations.ts');
const follows = read('hooks/mutations/useFollowMutations.ts');
const checks = [
  ['toggle requests use a per-key FIFO queue', queue.includes('pendingByKey.get(key)') && queue.includes('.then(operation)')],
  ['a rejected queued operation does not block later operations', queue.includes('previous.catch(() => undefined)')],
  ['queue cleanup cannot delete a newer operation', queue.includes('pendingByKey.get(key) === current')],
  ['ad favorite toggles are serialized per ad ID', favorites.includes("runSerializedMutation(JSON.stringify(['favorite', getSessionCleanupVersion(), 'ad', adId])")],
  ['polymorphic favorite toggles are serialized per type and ID', favorites.includes("runSerializedMutation(JSON.stringify(['favorite', getSessionCleanupVersion(), type, entityId])")],
  ['favorite mutations have scoped mutation keys for pending counts', favorites.includes("mutationKey: ['favorite-toggle', 'ad']") && favorites.includes("mutationKey: ['favorite-toggle', type]")],
  ['favorite errors do not restore stale optimistic snapshots', !favorites.includes('context.previousIds') && !favorites.includes('context.optimisticFavorite')],
  ['favorite list reconciliation waits for the final same-scope mutation', favorites.includes("isMutating({ mutationKey: ['favorite-toggle', 'ad'] }) > 1") && favorites.includes("isMutating({ mutationKey: ['favorite-toggle', type] }) > 1")],
  ['follow requests are serialized per target', follows.includes("runSerializedMutation(JSON.stringify(['follow', getSessionCleanupVersion(), targetType, targetId])")],
  ['toggle queues are fenced by session-cleanup version', favorites.includes('getSessionCleanupVersion()') && follows.includes('getSessionCleanupVersion()')],
  ['follow shared list/feed invalidation is deferred until final pending mutation', follows.includes("isMutating({ mutationKey: ['follow-toggle'] }) <= 1")],
];
let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) failed++;
}
console.log(`Toggle ordering lifecycle audit: ${checks.length - failed}/${checks.length} passed`);
assert.equal(failed, 0, `${failed} audit checks failed`);
