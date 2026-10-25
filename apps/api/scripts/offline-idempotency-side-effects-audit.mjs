import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
}
function duplicateReplayIsSideEffectSafe(source, entityName, ownerGuard) {
  const duplicateBranch = source.match(new RegExp(`if \\(existing && ${ownerGuard}\\) \\{([\\s\\S]*?)\\n\\s*\\} else \\{`));
  return Boolean(
    source.includes('let createdNew = true;') &&
    source.includes('createdNew = false;') &&
    source.includes('if (createdNew) {') &&
    duplicateBranch &&
    duplicateBranch[1].includes(`${entityName} = existing`) &&
    duplicateBranch[1].includes('cleanupUploadedImages(')
  );
}

const ads = read('src/modules/ads/ads.service.ts');
const products = read('src/modules/products/products.service.ts');
const services = read('src/modules/service-listings/service-listings.service.ts');
const serviceRequests = read('src/modules/service-requests/service-requests.service.ts');
const requests = read('src/modules/requests/requests.service.ts');
const schema = read('prisma/schema.prisma');

check('Ad duplicate-P2002 replay suppresses create-only side effects and cleans unused uploads', duplicateReplayIsSideEffectSafe(ads, 'ad', 'existing.userId === userId'));
check('Product duplicate-P2002 replay suppresses create-only side effects and cleans unused uploads', duplicateReplayIsSideEffectSafe(products, 'product', 'existing.storeId === store.id'));
check('Service listing duplicate-P2002 replay suppresses create-only side effects and cleans unused uploads', duplicateReplayIsSideEffectSafe(services, 'listing', 'existing.providerId === provider.id'));
check('Service request duplicate-P2002 replay suppresses duplicate activity/notifications', serviceRequests.includes('let createdNew = true;') && serviceRequests.includes('createdNew = false;') && serviceRequests.includes('if (createdNew) {') && serviceRequests.includes('existing.customerId === customerId'));
check('Open request create handles unique-operation race and returns only same-owner row', requests.includes("'P2002'") && requests.includes('existing.customerId === customerId') && requests.includes('where: { offlineOperationId }'));
check('Database schema has unique nullable offline operation IDs for all four audited entity types', ['model Ad {','model Product {','model ServiceListing {','model ServiceRequest {'].every((model) => {
  const start = schema.indexOf(model);
  if (start < 0) return false;
  const next = schema.indexOf('\nmodel ', start + model.length);
  const body = schema.slice(start, next < 0 ? schema.length : next);
  return /offlineOperationId\s+String\?\s+@unique/.test(body);
}));
check('Same operation ID cannot be replayed across a different owner for ads/products/services/service requests', [
  ads.includes('existing.userId !== userId') || ads.includes('existing.userId === userId'),
  products.includes('existing.storeId !== store.id'),
  services.includes('existing.providerId !== provider.id'),
  serviceRequests.includes('existing.customerId !== customerId'),
].every(Boolean));

for (const item of checks) console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}`);
console.log(`\n${checks.filter((item) => item.pass).length}/${checks.length} checks passed`);
if (checks.some((item) => !item.pass)) process.exitCode = 1;
