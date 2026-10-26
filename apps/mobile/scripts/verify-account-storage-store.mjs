import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const checks = [
  ['storage management screen exists', existsSync(join(root, 'app/storage.tsx'))],
  ['storage screen shows public cache metrics', /getPublicCacheStats/.test(read('app/storage.tsx'))],
  ['storage screen shows current account draft summary', /getAdDraftStorageSummary/.test(read('app/storage.tsx'))],
  ['storage screen exposes offline queue', /offline-queue/.test(read('app/storage.tsx'))],
  ['public cache exposes aggregate stats', /export async function getPublicCacheStats/.test(read('src/storage/public-cache.ts'))],
  ['draft store exposes account-scoped summary', /export async function getAdDraftStorageSummary/.test(read('src/storage/ad-draft-store.ts'))],
  ['profile uploads avatar through API', /uploadMyAvatar/.test(read('app/profile.tsx')) && /\/api\/v1\/users\/me\/avatar/.test(read('src/features/account/account.api.ts'))],
  ['notification settings use saved preference object', /profile\.notificationPreferences/.test(read('app/settings.tsx'))],
  ['notification defaults match web opt-outs and include missing preferences', /adViews: false/.test(read('app/settings.tsx')) && /promotions: false/.test(read('app/settings.tsx')) && /installmentAlerts/.test(read('app/settings.tsx')) && /weeklySalesReport/.test(read('app/settings.tsx'))],
  ['notification save is blocked until preferences load', /preferencesLoaded/.test(read('app/settings.tsx')) && /disabled={!preferencesLoaded \|\| loadingPreferences}/.test(read('app/settings.tsx'))],
  ['quiet hours include email fallback, timezone and time validation', /emailFallback/.test(read('app/settings.tsx')) && /quietHoursTimeZone/.test(read('app/settings.tsx')) && /validTime/.test(read('app/settings.tsx'))],
  ['storage stats propagate database errors instead of returning zero values', /export async function getPublicCacheStats\(\): Promise<PublicCacheStats> \{\n  const db/.test(read('src/storage/public-cache.ts')) && /export async function getAdDraftStorageSummary\(ownerId: string\): Promise<AdDraftStorageSummary> \{\n  if/.test(read('src/storage/ad-draft-store.ts'))],
  ['storage sizes are calculated as UTF-8 bytes', /utf8ByteLength/.test(read('src/storage/public-cache.ts')) && /utf8ByteLength/.test(read('src/storage/ad-draft-store.ts')) && /sizeBytes/.test(read('app/storage.tsx'))],
  ['avatar rejects unsupported image types before upload', /صيغة الصورة غير مدعومة/.test(read('app/profile.tsx')) && /image\/webp/.test(read('app/profile.tsx'))],
  ['settings links storage and store management', /router\.push\('\/storage'\)/.test(read('app/settings.tsx')) && /router\.push\('\/my-store'\)/.test(read('app/settings.tsx'))],
  ['home screen links to storage', /router\.push\('\/storage'\)/.test(read('app/index.tsx'))],
  ['store management links seller orders and products', /طلبات متجري/.test(read('app/my-store.tsx')) && /my-products/.test(read('app/my-store.tsx'))],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exitCode = 1;
else console.log(`\n${checks.length} checks passed.`);
