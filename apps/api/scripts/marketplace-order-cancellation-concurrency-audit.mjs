import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..');
const service = fs.readFileSync(path.join(backend, 'src/modules/marketplace-orders/marketplace-orders.service.ts'), 'utf8');
const checks = [
  ['order row is locked before status is read', /SELECT "id" FROM "marketplace_orders" WHERE "id" = \$\{id\} FOR UPDATE[\s\S]*?marketplaceOrder\.findUnique/.test(service)],
  ['product rows are locked in deterministic order before stock restore', /map\(item => item\.productId\)[\s\S]*?\.sort\(\)[\s\S]*?FROM "products" WHERE "id" = \$\{productId\} FOR UPDATE/.test(service)],
  ['restock uses the locked current quantity', /stockQuantity: restored/.test(service)],
  ['inactive products do not become discoverable through cancellation', /product\.status === 'ACTIVE' \? \{ availability: restored <= 0 \? 'OUT_OF_STOCK' : restored <= 5 \? 'LIMITED' : 'IN_STOCK' \}/.test(service)],
  ['cancellation still records a stock movement', /Marketplace order \$\{order\.id\} cancellation/.test(service)],
  ['transaction remains serializable', /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/.test(service)],
];
let failed = 0;
for (const [label, ok] of checks) {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${label}\n`);
  if (!ok) failed++;
}
process.stdout.write(`\n${checks.length - failed}/${checks.length} checks passed\n`);
if (failed) process.exitCode = 1;
