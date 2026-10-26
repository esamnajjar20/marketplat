import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checks = [
  ['service list screen', 'app/services.tsx', ['fetchServiceListings', 'RefreshControl', 'getCachedServiceListings', "router.push(`/services/"]],
  ['service detail screen', 'app/services/[id].tsx', ['fetchServiceListing', 'getCachedServiceListing', 'اطلب هذه الخدمة', 'router.push({ pathname: \'/service-requests\'']],
  ['service requests screen', 'app/service-requests.tsx', ['fetchServiceRequests', 'createServiceRequest', 'respondToServiceRequest', 'الطلبات الواردة', 'طلباتي']],
  ['service API', 'src/features/services/services.api.ts', ['/api/v1/service-listings', '/api/v1/service-requests', 'writePublicCache', 'readPublicCache']],
  ['home discovery entry points', 'app/index.tsx', ["router.push('/services')", "router.push('/service-requests')", 'quickActions']],
];
let failures = 0;
for (const [name, relative, needles] of checks) {
  const file = resolve(root, relative);
  if (!existsSync(file)) { console.error(`FAIL ${name}: missing ${relative}`); failures++; continue; }
  const content = readFileSync(file, 'utf8');
  const missing = needles.filter((needle) => !content.includes(needle));
  if (missing.length) { console.error(`FAIL ${name}: missing markers ${missing.join(', ')}`); failures++; }
  else console.log(`PASS ${name}`);
}
if (failures) process.exitCode = 1;
else console.log(`Feature Phase 1 static checks passed (${checks.length} checks).`);
