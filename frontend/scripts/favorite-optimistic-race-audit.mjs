import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const source = fs.readFileSync(path.join(process.cwd(), 'hooks/mutations/useFavoriteMutations.ts'), 'utf8');
const checks = [
  ['ad favorite mutation is serialized by session, kind, and ad ID', /runSerializedMutation\(JSON\.stringify\(\['favorite', getSessionCleanupVersion\(\), 'ad', adId\]\)/.test(source)],
  ['ad favorite uses a Set for optimistic membership', /setQueryData<Set<string>>\(queryKeys\.favorites\.ids\(\), \(old\) =>/.test(source)],
  ['ad favorite does not restore a stale snapshot on failure', /No rollback snapshot is retained/.test(source) && !/context\.previousIds/.test(source)],
  ['queued offline ad mutation is kept optimistic', /if \(parsed\?\.queued\) return;/.test(source)],
  ['entity favorite mutation is serialized by session, type, and entity ID', /runSerializedMutation\(JSON\.stringify\(\['favorite', getSessionCleanupVersion\(\), type, entityId\]\)/.test(source)],
  ['entity favorite uses a Set for optimistic membership', /setQueryData<Set<string>>\(queryKeys\.favorites\.entityIds\(type\), \(old\) =>/.test(source)],
  ['entity favorite does not restore a stale snapshot on failure', /Avoid retaining a stale rollback snapshot/.test(source) && !/context\.previousIds/.test(source)],
  ['settled invalidations reconcile ad and entity favorite data', /invalidateQueries\(\{ queryKey: queryKeys\.favorites\.listRoot\(\) \}\)/.test(source) && /invalidateQueries\(\{ queryKey: queryKeys\.favorites\.entityListRoot\(type\) \}\)/.test(source)],
];
let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) failed++;
}
console.log(`Favorite optimistic race audit: ${checks.length - failed}/${checks.length} passed`);
assert.equal(failed, 0, `${failed} audit checks failed`);
