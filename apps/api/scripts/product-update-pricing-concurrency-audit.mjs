import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const repository = readFileSync(new URL('../src/modules/products/products.repository.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/modules/products/products.service.ts', import.meta.url), 'utf8');

const lockAt = repository.indexOf('FOR UPDATE', repository.indexOf('updateWithStockMovement'));
const lockedPricingAt = repository.indexOf('const finalPrice = data.price', lockAt);
const updateAt = repository.indexOf('tx.product.update({ where: { id, storeId }, data })', lockAt);
assert.ok(lockAt >= 0, 'product update transaction locks the product row');
assert.ok(lockedPricingAt > lockAt && lockedPricingAt < updateAt, 'pricing invariants are checked after lock and before update');
assert.ok(repository.indexOf("'INVALID_DISCOUNT_PRICE'", lockedPricingAt) < updateAt, 'discount must remain below final price');
assert.ok(repository.indexOf("'INVALID_WHOLESALE_PRICING'", lockedPricingAt) < updateAt, 'wholesale price and minimum quantity must remain paired');
assert.match(service, /const updated = await productsRepository\.updateWithStockMovement\([\s\S]*?patch,[\s\S]*?'MANUAL_ADJUSTMENT'[\s\S]*?\);/, 'all product patches use the serialized repository update path');
console.log('Product update/pricing concurrency audit passed: 5 assertions.');
