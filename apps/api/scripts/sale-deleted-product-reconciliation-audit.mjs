import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/modules/sales/sales.service.ts', import.meta.url), 'utf8');
const lockStart = source.indexOf('const lockProduct = async');
const lockEnd = source.indexOf('// Serialize payment and return mutations', lockStart);
assert.ok(lockStart >= 0 && lockEnd > lockStart, 'lockProduct helper exists');
const lockHelper = source.slice(lockStart, lockEnd);
assert.match(lockHelper, /options:\s*\{\s*allowDeleted\?: boolean\s*\}/, 'lock helper supports reconciliation override');
assert.match(lockHelper, /product\.status === 'DELETED' && !options\.allowDeleted/, 'deleted products remain blocked by default');

const removeStart = source.indexOf('  remove: async');
const paymentStart = source.indexOf('  addPayment: async', removeStart);
const removeBlock = source.slice(removeStart, paymentStart);
assert.match(removeBlock, /lockProduct\(tx, item\.productId, \{ allowDeleted: true \}\)/, 'sale deletion can restore inventory for soft-deleted products');
assert.match(removeBlock, /SALE_DELETE:/, 'sale deletion keeps stock movement audit reason');

const returnStart = source.indexOf('  addReturn: async');
const returnEnd = source.indexOf('  summary: async', returnStart);
const returnBlock = source.slice(returnStart, returnEnd);
assert.match(returnBlock, /lockProduct\(tx, item\.productId, \{ allowDeleted: true \}\)/, 'returns can reconcile inventory for soft-deleted products');
assert.match(returnBlock, /RETURN:/, 'returns keep stock movement audit reason');

const createStart = source.indexOf('const product = await lockProduct(tx, item.productId);');
assert.ok(createStart >= 0, 'POS sale creation uses strict default lock behavior');
const singleSaleStart = source.indexOf('const product = await lockProduct(tx, input.entityId);');
assert.ok(singleSaleStart >= 0, 'single-product sale creation uses strict default lock behavior');
console.log('Sale deleted-product reconciliation audit passed: 6/6 checks.');
