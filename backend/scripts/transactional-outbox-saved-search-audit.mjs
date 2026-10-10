import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const ads = read('src/modules/ads/ads.service.ts');
const savedSearches = read('src/modules/saved-searches/saved-searches.service.ts');
const worker = read('src/shared/outbox/outbox.worker.ts');
const schema = read('prisma/schema.prisma');

const checks = [
  ['ad creation imports the canonical saved-search matcher', /import \{ matchesAdFilters, savedSearchType \} from '\.\.\/saved-searches\/saved-searches\.service';/.test(ads)],
  ['saved-search matching is done using the ad-creation transaction client', /const savedSearches = await tx\.savedSearch\.findMany/.test(ads)],
  ['matching excludes the ad owner and non-ad search types', /search\.userId !== created\.userId && savedSearchType\(search\) === 'ads'/.test(ads)],
  ['matched recipients are enqueued in the same transaction', /eventType: 'SAVED_SEARCH_MATCH_NOTIFICATION'[\s\S]{0,700}matches: matchingSavedSearches\.map/.test(ads)],
  ['outbox key is stable per created ad', /saved-search-match:ad-created:\$\{created\.id\}/.test(ads)],
  ['old fire-and-forget ad matcher is removed from post-commit path', !/savedSearchEvents\.onAdCreated\(ad\)/.test(ads)],
  ['canonical ad matcher is exported for transactional use', /export function matchesAdFilters\(/.test(savedSearches)],
  ['saved-search type defaulting is exported and retained', /export function savedSearchType\([\s\S]{0,220}return filters\.type \?\? 'ads'/.test(savedSearches)],
  ['worker validates the saved-search event payload', /function parseSavedSearchMatchPayload\(/.test(worker) && /Saved-search outbox matches are invalid/.test(worker)],
  ['worker respects saved-search notification preferences', /function preferenceAllowsSavedSearch\(/.test(worker) && /preferenceAllowsSavedSearch\(user\.notificationPreferences\)/.test(worker)],
  ['notification writes use per-search, per-recipient idempotency', /idempotencyKey: `outbox:\$\{event\.id\}:saved-search:\$\{match\.savedSearchId\}:recipient:\$\{match\.userId\}`/.test(worker)],
  ['notification rows and outbox acknowledgement share one transaction', /async function processSavedSearchMatchEvent[\s\S]*?prisma\.\$transaction\(async \(tx\) => \{[\s\S]*?tx\.notification\.createManyAndReturn[\s\S]*?tx\.outboxEvent\.updateMany/.test(worker)],
  ['lastNotifiedAt is updated by the worker', /tx\.savedSearch\.updateMany\([\s\S]{0,160}lastNotifiedAt: new Date\(\)/.test(worker)],
  ['worker emits post-commit cache/SSE/push delivery hints', /Saved-search outbox SSE publish failed after durable commit/.test(worker) && /Saved-search outbox push failed after durable commit/.test(worker) && /unreadNotificationsCache\.invalidate/.test(worker)],
  ['worker dispatches saved-search events', /event\.eventType === 'SAVED_SEARCH_MATCH_NOTIFICATION'\) await processSavedSearchMatchEvent/.test(worker)],
  ['notification idempotency key remains unique and nullable for legacy rows', /model Notification \{[\s\S]*?idempotencyKey String\?\s+@unique/.test(schema)],
];

for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
}
console.log(`\n${checks.filter(([, passed]) => passed).length}/${checks.length} checks passed`);
assert.ok(checks.every(([, passed]) => passed), 'Saved-search transactional outbox audit failed');
