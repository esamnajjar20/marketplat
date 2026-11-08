import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), 'utf8');
const hook = read('hooks/queries/useServiceProviders.ts');
const analytics = read('components/services/MyServiceProviderAnalytics.tsx');
const tabs = read('components/services/MyServicesTabsHub.tsx');
const hub = read('components/services/MyServicesHub.tsx');
const list = read('components/services/MyServiceListingsList.tsx');
const schema = readFileSync(join(root, '../apps/api/prisma/schema.prisma'), 'utf8');
const migration = readFileSync(join(root, '../apps/api/prisma/migrations/20261108170000_add_provider_service_listing_feed_index/migration.sql'), 'utf8');
const activityMigration = readFileSync(join(root, '../apps/api/prisma/migrations/20261108153000_add_customer_service_request_list_indexes/migration.sql'), 'utf8');
const checks = [
  ['analytics query keeps previous period data', /placeholderData:\s*keepPreviousData/.test(hook)],
  ['analytics period transition is announced', /isFetching\s*&&\s*isPlaceholderData/.test(analytics) && /role="status"/.test(analytics)],
  ['analytics query remains period-keyed', /analyticsForPeriod\(userId \?\? 'anonymous', period\)/.test(hook)],
  ['analytics tab is rendered only for its active tab', /case 'analytics':[\s\S]*?<MyServiceProviderAnalytics\s*\/>/.test(tabs)],
  ['incoming requests tab remains isolated', /case 'requests':[\s\S]*?<IncomingServiceRequestsList\s*\/>/.test(tabs)],
  ['appointments tab remains isolated', /case 'appointments':[\s\S]*?<MyAppointmentsSection\s*\/>/.test(tabs)],
  ['overview shares dashboard query between summary and listings', /useMyServiceProviderDashboard/.test(hub) && /useMyServiceProviderDashboard/.test(list)],
  ['dashboard endpoint continues combining analytics and listings', /getMyDashboard\(/.test(hook) && /workspaceDashboard\(/.test(hook)],
  ['provider listing composite index is declared in Prisma', /@@index\(\[providerId, status, createdAt, id\]\)/.test(schema)],
  ['provider listing composite index has a matching migration', /CREATE INDEX \"service_listings_providerId_status_createdAt_id_idx\"/.test(migration)],
  ['activity customer indexes remain in the shared Prisma schema', /@@index\(\[customerId, createdAt\(sort: Desc\)\]\)/.test(schema) && /@@index\(\[customerId, status, createdAt\(sort: Desc\)\]\)/.test(schema)],
  ['activity index migration remains bundled as a schema dependency', /CREATE INDEX \"service_requests_customerId_createdAt_idx\"/.test(activityMigration)],
];
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
