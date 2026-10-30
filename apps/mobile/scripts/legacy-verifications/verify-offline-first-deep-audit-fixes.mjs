import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const lifecycle = read('src/storage/outbox-sync-lifecycle.ts');
assert.match(lifecycle, /const drainQueue = async/);
for (const worker of ['syncNextMarketplaceRequest', 'syncNextRequestOffer', 'syncNextMarketplaceOrder', 'syncNextOfflineCreate']) {
  assert.match(lifecycle, new RegExp(`drainQueue\\(snapshot => ${worker}`), `${worker} must drain its durable queue`);
}
assert.match(lifecycle, /processed < 50/);
for (const [path, table] of [
  ['src/storage/request-outbox.ts', 'request_create_outbox'],
  ['src/storage/request-offer-outbox.ts', 'request_offer_outbox'],
  ['src/storage/order-outbox.ts', 'marketplace_order_outbox'],
  ['src/storage/entity-create-outbox.ts', 'entity_create_outbox'],
]) {
  const source = read(path);
  assert.match(source, new RegExp(`UPDATE ${table} SET state='pending',lease_until=0,next_attempt_at=MAX\\(next_attempt_at,\\?\\) WHERE state='processing' AND lease_until<=\\?`), `${table} must recover expired leases on each sync attempt`);
}
const validation = read('../api/src/modules/sales/sales.validation.ts');
assert.match(validation, /MAX_MONEY = 99_999_999\.99/);
assert.match(validation, /!Number\.isFinite\(total\) \|\| total > MAX_MONEY/);
const saleScreen = read('app/sale-create.tsx');
assert.match(saleScreen, /!Number\.isFinite\(total\) \|\| total <= 0 \|\| total > 99_999_999\.99/);
console.log('Deep audit regression checks passed: bounded queue draining, expired lease recovery, and sale money bounds.');
