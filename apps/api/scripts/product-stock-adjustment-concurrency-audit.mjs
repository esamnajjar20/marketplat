import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..');
const repository = fs.readFileSync(path.join(backend, 'src/modules/products/products.repository.ts'), 'utf8');
const sales = fs.readFileSync(path.join(backend, 'src/modules/sales/sales.service.ts'), 'utf8');
const checks = [
  ['stock adjustment uses SELECT FOR UPDATE before reading previous quantity', /updateWithStockMovement:[\s\S]*?\$transaction\(async tx => \{[\s\S]*?SELECT "id", "storeId", "stockQuantity", "status" FROM "products" WHERE "id" = \$\{id\} FOR UPDATE[\s\S]*?const current = lockedRows\[0\]/.test(repository)],
  ['stock movement is created in the same transaction as the stock update', /const updated = await tx\.product\.update\([\s\S]*?await tx\.stockMovement\.create\([\s\S]*?return updated;/.test(repository)],
  ['stock delta is based on locked previous quantity', /const previousQuantity = current\.stockQuantity;[\s\S]*?const newQuantity = updated\.stockQuantity;[\s\S]*?delta:[\s\S]*?newQuantity - previousQuantity/.test(repository)],
  ['deleted products cannot be adjusted through this repository path', /!current \|\| current\.storeId !== storeId \|\| current\.status === 'DELETED'/.test(repository)],
  ['POS sale also serializes product stock changes with row locks', /SELECT "id", "storeId", "stockQuantity", "status" FROM "products" WHERE "id" = \$\{productId\} FOR UPDATE/.test(sales)],
];
let failed = 0;
for (const [label, ok] of checks) {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${label}\n`);
  if (!ok) failed++;
}
process.stdout.write(`\n${checks.length - failed}/${checks.length} checks passed\n`);
if (failed) process.exitCode = 1;
