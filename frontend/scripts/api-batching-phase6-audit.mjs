import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const controller = read('../apps/api/src/modules/commerce/customers/customers.controller.ts');
const service = read('../apps/api/src/modules/commerce/customers/customers.service.ts');
const routes = read('../apps/api/src/modules/commerce/customers/customers.routes.ts');
const api = read('api/customers.api.ts');
const hooks = read('hooks/queries/useCustomers.ts');
const page = read('components/sales/CustomersPageClient.tsx');
const invalidation = read('lib/queryInvalidation.ts');

assert.match(controller, /overview:\s*async/);
assert.match(service, /Promise\.allSettled\(\[\s*customersRepository\.summary\(sellerId\),\s*customersRepository\.list\(sellerId, query\)/);
assert.match(service, /failures:\s*\{/);
assert.match(routes, /get\('\/overview', customersController\.overview\)/);
assert.match(api, /'\/customers\/overview'/);
assert.match(hooks, /queryKeys\.customers\.overview/);
assert.match(page, /useCustomerOverview/);
assert.match(page, /useCustomers\([^;]+hasSearch\)/);
assert.match(invalidation, /customers\.overviewRoot\(\)/);
console.log('API batching phase 6 audit: 9/9 checks passed');
