import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const schema = fs.readFileSync(path.join(root, 'apps/api/prisma/schema.prisma'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'apps/api/prisma/migrations/20261108153000_add_customer_service_request_list_indexes/migration.sql'), 'utf8');
const repo = fs.readFileSync(path.join(root, 'apps/api/src/modules/service-requests/service-requests.repository.ts'), 'utf8');
const checks = [
  ['customer chronological index in Prisma schema', /@@index\(\[customerId,\s*createdAt(?:\(sort:\s*Desc\))?\]\)/.test(schema)],
  ['customer status chronological index in Prisma schema', /@@index\(\[customerId,\s*status,\s*createdAt(?:\(sort:\s*Desc\))?\]\)/.test(schema)],
  ['unfiltered index migration', migration.includes('("customerId", "createdAt" DESC)')],
  ['filtered index migration', migration.includes('("customerId", "status", "createdAt" DESC)')],
  ['query remains customer-scoped', /where: Prisma\.ServiceRequestWhereInput = \{ customerId, \...\(status && \{ status \}\) \}/.test(repo)],
  ['list and count remain parallel', /Promise\.all\(\[\s*prisma\.serviceRequest\.findMany/.test(repo)],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`\n${checks.length}/${checks.length} checks passed`);
