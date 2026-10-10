import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const schema = read('prisma/schema.prisma');
const ads = read('src/modules/ads/ads.service.ts');
const products = read('src/modules/products/products.service.ts');
const listings = read('src/modules/service-listings/service-listings.service.ts');
const requests = read('src/modules/service-requests/service-requests.service.ts');
const notifications = read('src/modules/notifications/notifications.service.ts');
const activityBuffer = read('src/shared/utils/activityBuffer.ts');
const backgroundTask = read('src/shared/utils/backgroundTask.ts');
const server = read('src/server.ts');

const checks = [
  ['No existing Prisma Outbox model (rollout must add one explicitly)', !/model\s+(Outbox|OutboxEvent)\s*\{/.test(schema)],
  ['Ads creation commits entity through a Prisma transaction', /return\s+prisma\.\$transaction\(async\s+tx\s*=>/.test(ads)],
  ['Products creation commits entity through a Prisma transaction', /return\s+prisma\.\$transaction\(async\s+tx\s*=>/.test(products)],
  ['Service listing creation commits entity through a Prisma transaction', /prisma\.\$transaction\(async\s+tx\s*=>/.test(listings)],
  ['Service request creation commits entity through a Prisma transaction', /prisma\.\$transaction\(async\s+tx\s*=>/.test(requests)],
  ['Ad side effects are scheduled after the createdNew transaction branch', /if\s*\(createdNew\)\s*\{[\s\S]{0,1800}activityService\.record/.test(ads)],
  ['Product notifications are dispatched outside the entity transaction', /if\s*\(createdNew\)\s*\{[\s\S]{0,900}notificationEvents\.onStoreNewProduct/.test(products)],
  ['Service request notification is dispatched after create transaction', /if\s*\(createdNew\)\s*\{[\s\S]{0,900}notificationEvents\s*\n\s*\.onServiceRequestCreated/.test(requests)],
  ['User activity currently crosses a separate Redis buffer boundary', /redis\s*\.pipeline\(\)/.test(activityBuffer) && /activityBuffer\.startFlushTimer\(\)/.test(server)],
  ['FailedBackgroundTask is failure tracking, not an Outbox dispatch ledger', /model\s+FailedBackgroundTask\s*\{/.test(schema) && /resolved\s+Boolean/.test(schema) && !/model\s+OutboxEvent\s*\{/.test(schema)],
  ['Notification persistence and push delivery are distinct operations', /notificationsRepository\.create/.test(notifications) && /pushService\.notify/.test(notifications)],
  ['Activity idempotency key exists for buffered duplicate writes', /idempotencyKey\s+String\?\s+@unique/.test(schema) && /skipDuplicates:\s*true/.test(activityBuffer)],
  ['Background failure recorder persists retry context', /FailedBackgroundTask/.test(backgroundTask) && /payload/.test(backgroundTask)],
];

let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
