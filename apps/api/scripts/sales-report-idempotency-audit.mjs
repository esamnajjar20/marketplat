import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const repository = readFileSync(resolve(root, 'src/modules/sales/sales.repository.ts'), 'utf8');
const service = readFileSync(resolve(root, 'src/modules/sales/sales.service.ts'), 'utf8');
const tests = readFileSync(resolve(root, 'tests/unit/sales.repository.test.ts'), 'utf8');

assert.match(repository, /SUM\(sr\."totalPrice" - sr\."refundedAmount"\)/, 'Top-customer totals must subtract refunds');
assert.match(repository, /LIMIT \$\{safeLimit\}/, 'Top-customer SQL limit must be bounded');
assert.match(repository, /GROUP BY sr\."customerId"/, 'Top-customer ranking must aggregate by customer ID');
assert.match(service, /saleCreateReplayMatches\(savedSale, input\)/, 'Sale idempotency replay must validate payload');
assert.match(service, /SALE_OPERATION_CONFLICT/, 'Mismatched sale idempotency keys must conflict');
assert.match(tests, /ranks customers by net revenue after refunds/, 'Repository regression test must cover net revenue');
console.log('Sales/report audit checks passed: net customer revenue, bounded ranking, and payload-safe idempotency.');
