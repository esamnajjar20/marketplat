import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync('prisma/schema.prisma', 'utf8');
const migration = readFileSync('prisma/migrations/20261010120000_add_transactional_outbox/migration.sql', 'utf8');
const ads = readFileSync('src/modules/ads/ads.service.ts', 'utf8');
const worker = readFileSync('src/shared/outbox/outbox.worker.ts', 'utf8');
const script = readFileSync('src/scripts/runOutboxWorker.ts', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const checks = [
  ['Prisma OutboxEvent model exists', /model OutboxEvent\s*\{/.test(schema)],
  ['Unique idempotency key is declared', /idempotencyKey\s+String\s+@unique/.test(schema)],
  ['Migration creates durable queue table and unique index', /CREATE TABLE "outbox_events"/.test(migration) && /CREATE UNIQUE INDEX "outbox_events_idempotencyKey_key"/.test(migration)],
  ['Ad creation enqueues activity inside its transaction callback', /prisma\.\$transaction\(async tx =>/.test(ads) && /tx\.outboxEvent\.create\(/.test(ads) && ads.indexOf('tx.outboxEvent.create(') > ads.indexOf('prisma.$transaction(async tx =>') && ads.indexOf('tx.outboxEvent.create(') < ads.indexOf('return created;', ads.indexOf('prisma.$transaction(async tx =>'))],
  ['Direct duplicate AD_CREATED activity call removed', !/activityService\.record\(\{ userId, \.\.\.activityTemplates\.adCreated/.test(ads)],
  ['Worker uses SKIP LOCKED claims', /FOR UPDATE SKIP LOCKED/.test(worker)],
  ['Worker reclaims expired leases', /lockedAt" < NOW\(\) -/.test(worker)],
  ['Activity write and acknowledgement share a transaction', /prisma\.\$transaction\(async \(tx\) =>/.test(worker) && /tx\.userActivity\.createMany/.test(worker) && /tx\.outboxEvent\.updateMany/.test(worker)],
  ['Activity consumer is idempotent', /skipDuplicates:\s*true/.test(worker) && /outbox:\$\{event\.idempotencyKey\}/.test(worker)],
  ['Retry uses bounded exponential backoff', /2 \*\* exponent/.test(worker) && /MAX_BACKOFF_MS/.test(worker)],
  ['Standalone worker script is registered', packageJson.scripts['worker:outbox'] === 'ts-node-dev --transpile-only --exit-child src/scripts/runOutboxWorker.ts' && /runOutboxWorker\(\(\) => stopping\)/.test(script)],
];
let failures = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) failures++;
}
console.log(`\n${checks.length - failures}/${checks.length} checks passed`);
if (failures) process.exitCode = 1;
