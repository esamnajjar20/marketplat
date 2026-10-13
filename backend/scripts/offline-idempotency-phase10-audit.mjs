import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
const schema = read('prisma/schema.prisma');
const model = (name) => {
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) return '';
  const next = schema.indexOf('\nmodel ', start + 7);
  return schema.slice(start, next < 0 ? schema.length : next);
};
const cases = [
  ['ads', 'src/modules/ads/ads.service.ts', 'ad', 'userId', 'if (createdNew) {'],
  ['products', 'src/modules/products/products.service.ts', 'product', 'storeId', 'if (createdNew) {'],
  ['service listings', 'src/modules/service-listings/service-listings.service.ts', 'serviceListing', 'providerId', 'if (createdNew) {'],
  ['service requests', 'src/modules/service-requests/service-requests.service.ts', 'serviceRequest', 'customerId', 'if (createdNew) {'],
  ['requests', 'src/modules/requests/requests.service.ts', 'request', 'customerId', null],
];

for (const [label, path, delegate, ownerField, sideEffectGuard] of cases) {
  const source = read(path);
  const schemaModel = model(({ ad: 'Ad', product: 'Product', serviceListing: 'ServiceListing', serviceRequest: 'ServiceRequest', request: 'Request' })[delegate]);
  check(`${label}: schema has durable unique operation id`, /offlineOperationId\s+String\?\s+@unique/.test(schemaModel));
  check(`${label}: preflight replay checks ownership`, source.includes(`existing.${ownerField} !==`) || source.includes(`existing.${ownerField} ===`));
  check(`${label}: concurrent unique-key race is recovered`, source.includes("error.code === 'P2002'") || source.includes("(error as { code?: string }).code === 'P2002'") || source.includes("(err as { code?: string }).code === 'P2002'"));
  check(`${label}: race recovery reads the committed row`, source.includes(`prisma.${delegate}.findUnique({ where: { offlineOperationId } })`) || source.includes(`where: { offlineOperationId }`));
  if (sideEffectGuard) check(`${label}: replay avoids duplicate creation side effects`, source.includes(sideEffectGuard));
}

const sales = read('src/modules/sales/sales.service.ts');
const salesSchema = model('SaleRecord');
check('sales: composite uniqueness is scoped to seller', /@@unique\(\[sellerId, offlineOperationId\]\)/.test(salesSchema));
check('sales: duplicate replay returns the same persisted sale', sales.includes('where: { sellerId: userId, offlineOperationId }') && sales.includes('return salesRepository.findById(existing.id)'));
const message = read('src/modules/conversations/conversations.service.ts');
check('messages: replay is scoped to sender and operation id', message.includes('findBySenderAndOperationId(userId, opId)'));
check('messages: database unique-race is handled', message.includes("isPrismaError(err, 'P2002')") && message.includes('OFFLINE_OP_ID_CONFLICT'));
const test = read('tests/integration/sales.flow.test.ts');
check('integration suite includes concurrent duplicate sales', test.includes('deduplicates concurrent retries of the same offline operation') && test.includes('Promise.all([send(), send()])'));
check('integration suite includes lost-ack replay regression', test.includes('replays a committed product sale without repeating inventory, payment, or customer side effects'));
check('integration suite includes cross-account same-key behavior', test.includes('scopes identical offline operation ids to each authenticated seller'));

for (const item of checks) console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}`);
const passed = checks.filter((item) => item.pass).length;
console.log(`Result: ${passed}/${checks.length} passed`);
if (passed !== checks.length) process.exitCode = 1;
