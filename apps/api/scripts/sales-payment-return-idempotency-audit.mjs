import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..');
const schema = fs.readFileSync(path.join(backend, 'prisma/schema.prisma'), 'utf8');
const migration = fs.readFileSync(path.join(backend, 'prisma/migrations/20261027120000_sales_payment_return_idempotency/migration.sql'), 'utf8');
const validation = fs.readFileSync(path.join(backend, 'src/modules/sales/sales.validation.ts'), 'utf8');
const service = fs.readFileSync(path.join(backend, 'src/modules/sales/sales.service.ts'), 'utf8');
const checks = [
  ['sale payment stores a unique offline operation ID', /model SalePayment \{[\s\S]*?offlineOperationId\s+String\?\s+@unique/.test(schema)],
  ['sale return stores a unique offline operation ID', /model SaleReturn \{[\s\S]*?offlineOperationId\s+String\?\s+@unique/.test(schema)],
  ['migration adds both nullable columns and unique indexes', /sale_payments.*offlineOperationId/s.test(migration) && /sale_returns.*offlineOperationId/s.test(migration) && (migration.match(/CREATE UNIQUE INDEX/g) ?? []).length === 2],
  ['payment and return operation IDs have bounded validation', (validation.match(/offlineOperationId: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(128\)\.optional\(\)/g) ?? []).length >= 2],
  ['payment replay checks operation ID and payload before adding side effects', /tx\.salePayment\.findUnique\(\{ where: \{ offlineOperationId: input\.offlineOperationId \} \}\)/.test(service) && /PAYMENT_OPERATION_CONFLICT/.test(service)],
  ['return replay checks operation ID and payload before inventory mutation', /tx\.saleReturn\.findUnique\(\{ where: \{ offlineOperationId: input\.offlineOperationId \} \}\)/.test(service) && /RETURN_OPERATION_CONFLICT/.test(service)],
  ['new operation ID is persisted for payment', /salePayment\.findUnique[\s\S]*?salesRepository\.addPayment\(tx, \{[\s\S]*?offlineOperationId: input\.offlineOperationId/.test(service)],
  ['new operation ID is persisted for return', /saleReturn\.findUnique[\s\S]*?salesRepository\.addReturn\(tx, \{[\s\S]*?offlineOperationId: input\.offlineOperationId/.test(service)],
];
let failed = 0;
for (const [label, ok] of checks) {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${label}\n`);
  if (!ok) failed++;
}
process.stdout.write(`\n${checks.length - failed}/${checks.length} checks passed\n`);
if (failed) process.exitCode = 1;
