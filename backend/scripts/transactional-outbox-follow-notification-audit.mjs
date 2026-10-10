import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20261010130000_add_notification_idempotency_key/migration.sql');
const ads = read('src/modules/ads/ads.service.ts');
const worker = read('src/shared/outbox/outbox.worker.ts');
const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
  process.stdout.write(`PASS ${name}\n`);
}

check('Notification model has nullable unique idempotency key', () => {
  assert.match(schema, /model Notification\s*\{[\s\S]*?idempotencyKey\s+String\?\s+@unique/);
});
check('Migration adds nullable column and unique index', () => {
  assert.match(migration, /ADD COLUMN "idempotencyKey" TEXT/);
  assert.match(migration, /CREATE UNIQUE INDEX "notifications_idempotencyKey_key"/);
});
check('Ad creation enqueues followed activity inside transaction', () => {
  const transactionStart = ads.indexOf('return prisma.$transaction(async tx =>');
  const event = ads.indexOf("eventType: 'FOLLOWED_ACTIVITY_NOTIFICATION'");
  const transactionReturn = ads.indexOf('return created;', event);
  assert.ok(transactionStart >= 0 && event > transactionStart && transactionReturn > event);
});
check('Outbox event key is deterministic per created ad', () => {
  assert.match(ads, /followed-activity:ad-created:\$\{created\.id\}/);
});
check('Direct fire-and-forget follower notification was removed from ad creation', () => {
  assert.doesNotMatch(ads, /followsService\.notifyActivityForTargets/);
});
check('Worker recognizes the followed activity event type', () => {
  assert.match(worker, /eventType === 'FOLLOWED_ACTIVITY_NOTIFICATION'/);
});
check('Worker validates target types and notification types', () => {
  assert.match(worker, /parseFollowedActivityPayload/);
  assert.match(worker, /targetTypes\.includes\(item\.targetType\)/);
  assert.match(worker, /notificationTypes\.includes\(payload\.type\)/);
});
check('Worker de-duplicates follower IDs before inserting notifications', () => {
  assert.match(worker, /Array\.from\(new Set\(followers\.map\(\(row\) => row\.followerId\)\)\)/);
});
check('Worker honors followUpdates preference with true default', () => {
  assert.match(worker, /preferenceAllowsFollowUpdates/);
  assert.match(worker, /preferences\.followUpdates/);
  assert.match(worker, /: true/);
});
check('Notification insert and outbox acknowledgement share one transaction', () => {
  const fn = worker.slice(worker.indexOf('async function processFollowedActivityEvent'), worker.indexOf('async function markRetry'));
  assert.match(fn, /prisma\.\$transaction\(async \(tx\)/);
  assert.ok(fn.indexOf('tx.notification.createManyAndReturn') >= 0);
  assert.ok(fn.indexOf('tx.outboxEvent.updateMany') > fn.indexOf('tx.notification.createManyAndReturn'));
});
check('Notification rows use per-event/per-recipient idempotency keys', () => {
  assert.match(worker, /outbox:\$\{event\.id\}:recipient:\$\{userId\}/);
});
check('Worker only processes outbox events while holding its lease', () => {
  assert.match(worker, /where: \{ id: event\.id, lockedBy: workerId, processedAt: null \}/);
  assert.match(worker, /Outbox lease lost before notification acknowledgement/);
});
check('Unread cache invalidation is chunked to bounded batches', () => {
  assert.match(worker, /i \+= 50/);
});
check('Push/SSE failures do not undo durable notification rows', () => {
  assert.match(worker, /durable notification rows/);
  assert.match(worker, /Outbox notification push failed after durable commit/);
});

console.log(`\n${checks.length}/${checks.length} static outbox notification checks passed.`);
