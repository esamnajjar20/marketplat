import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..');
const service = fs.readFileSync(path.join(backend, 'src/modules/sales/installments.service.ts'), 'utf8');
const validation = fs.readFileSync(path.join(backend, 'src/modules/sales/installments.validation.ts'), 'utf8');
const controller = fs.readFileSync(path.join(backend, 'src/modules/sales/installments.controller.ts'), 'utf8');
const unitTests = fs.readFileSync(path.join(backend, 'tests/unit/installments.service.test.ts'), 'utf8');
const checks = [
  ['installment payment accepts a bounded offline operation ID', /offlineOperationId:\s*z\.string\(\)\.trim\(\)\.min\(8\)\.max\(128\)\.optional\(\)/.test(validation)],
  ['controller passes operation ID to service', /installmentsService\.pay\(u\.userId, p\.params\.id, p\.body\.amount, p\.body\.offlineOperationId\)/.test(controller)],
  ['payment replay checks existing operation before balance mutation', /const existingPayment = await tx\.salePayment\.findUnique\(\{ where: \{ offlineOperationId \} \}\)/.test(service) && /PAYMENT_OPERATION_CONFLICT/.test(service)],
  ['new installment payment persists operation ID', /salePayment\.create\(\{\s*data:\s*\{[\s\S]*?offlineOperationId[\s\S]*?paymentNote/.test(service)],
  ['unique-key race is resolved as replay or conflict', /code === 'P2002'[\s\S]*?prisma\.salePayment\.findUnique/.test(service)],
  ['unit tests cover persistence, replay and payload conflict', /persists an offline operation ID/.test(unitTests) && /same operation is retried/.test(unitTests) && /different amount/.test(unitTests)],
];
let failed = 0;
for (const [label, ok] of checks) {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${label}\n`);
  if (!ok) failed++;
}
process.stdout.write(`\n${checks.length - failed}/${checks.length} checks passed\n`);
if (failed) process.exitCode = 1;
