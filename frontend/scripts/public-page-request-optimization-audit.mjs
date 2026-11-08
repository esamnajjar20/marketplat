import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');
const checks = [
  ['profile-state includes directional block status', read('apps/api/src/modules/users/users.service.ts').includes('blockedUsersService.isBlockedBy(viewerId, profileUserId)')],
  ['profile block button reuses profile-state query', read('frontend/components/profile/BlockUserButtonGate.tsx').includes('useProfileInteractionState(')],
  ['block mutation updates viewer-scoped profile-state cache', read('frontend/hooks/mutations/useBlockedUsersMutations.ts').includes('queryKeys.users.profileState(userId, viewerId')],
  ['service matches are deferred until near viewport', read('frontend/components/services/ServiceListingDetail.tsx').includes('<LazySection minHeight={220} rootMargin="160px 0px" whenIdle>')],
  ['related services are deferred until near viewport', read('frontend/app/(public)/services/[id]/page.tsx').includes('<LazySection minHeight={240} rootMargin="96px 0px" whenIdle>')],
  ['product recommendations are deferred until near viewport', read('frontend/components/stores/ProductDetail.tsx').includes('<LazySection minHeight={240} rootMargin="96px 0px" whenIdle>')],
  ['ad related section already uses lazy loading', read('frontend/components/ads/AdDetailSection.tsx').includes('<LazySection minHeight={240} rootMargin="64px 0px" whenIdle>')],
];
let failed = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
