import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const readRoot = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const onboarding = read('components/profile/OnboardingChecklist.tsx');
const statsApi = read('api/ads.api.ts');
const repo = readRoot('../../apps/api/src/modules/ads/ads.repository.ts');
const service = readRoot('../../apps/api/src/modules/ads/ads.service.ts');
const invalidation = read('lib/queryInvalidation.ts');
const checks = [
  ['onboarding reuses aggregate stats hook', /useMyAdStats/.test(onboarding)],
  ['onboarding no longer calls paginated my ads hook', !/useMyAds\s*\(/.test(onboarding)],
  ['aggregate API exposes totalAds', /totalAds:\s*number/.test(statsApi)],
  ['SQL aggregate counts all non-deleted ads', /COUNT\(\*\) AS "totalAds"/.test(repo) && /"status" <> 'DELETED'/.test(repo)],
  ['service result includes totalAds', /totalAds:\s*number/.test(service)],
  ['ad writes invalidate aggregate through mineRoot', /mineRoot\(\).*myStats/s.test(invalidation) || /mineRoot\(\).*prefixes myStats/.test(invalidation)],
];
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
assert.ok(checks.every(([, ok]) => ok), 'Dashboard request audit failed');
console.log(`${checks.length}/${checks.length} checks passed`);
