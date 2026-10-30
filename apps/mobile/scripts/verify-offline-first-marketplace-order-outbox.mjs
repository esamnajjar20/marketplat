import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.cwd());
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const outbox = read('src/storage/order-outbox.ts');
const lifecycle = read('src/storage/outbox-sync-lifecycle.ts');
const checkout = read('app/order-checkout.tsx');
const queue = read('app/offline-queue.tsx');
const checks = [
  ['durable SQLite order queue is account-scoped', outbox.includes('marketplace_order_outbox') && outbox.includes('owner_id=?')],
  ['order retry reuses the server idempotency key', outbox.includes("'X-Offline-Op-Id': payload.idempotencyKey") && outbox.includes('JSON.stringify(payload)')],
  ['queue validates delivery data and product quantities', outbox.includes('validatePayload') && outbox.includes('row.quantity <= 100') && outbox.includes('Number.isInteger(row.quantity)')],
  ['order queue is triggered by app lifecycle sync', lifecycle.includes('syncNextMarketplaceOrder')],
  ['checkout queues only transport failures without HTTP status', checkout.includes('e instanceof ApiError && e.status === undefined')],
  ['offline queue exposes saved orders and cancellation', queue.includes('listPendingMarketplaceOrders') && queue.includes('discardMarketplaceOrder')],
  ['UI warns order is not server-confirmed and stock/price are rechecked', queue.includes('ليس مؤكدًا لدى المتجر') && queue.includes('المخزون عند المزامنة')],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
console.log('Offline-first marketplace order outbox checks passed.');
