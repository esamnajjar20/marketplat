/** Static guardrails for offline UX phases 3-4. No dependencies required. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, ok) => checks.push({ name, ok });

const fallback = read('components/shared/feedback/OfflineQueryFallback.tsx');
check('shared offline fallback exposes accessible status and a clear no-cache explanation',
  fallback.includes('role="status"') && fallback.includes('aria-live="polite"') && fallback.includes('لا توجد نسخة محفوظة'));

for (const [file, name] of [
  ['components/stores/ProductsGrid.tsx', 'products'],
  ['components/stores/StoresGrid.tsx', 'stores'],
  ['components/ads/SearchResults.tsx', 'ads'],
  ['components/services/ServiceListingsGrid.tsx', 'services'],
  ['components/search/SearchResults.tsx', 'search'],
  ['components/requests/RequestsPageClient.tsx', 'requests'],
]) {
  const source = read(file);
  check(`${name} list uses shared offline fallback`, source.includes('OfflineQueryFallback'));
}

const planner = read('lib/offlineWarmingPlanner.ts');
const routeShells = read('lib/offlineRouteShells.ts');
const scheduler = read('lib/offlineWarmingScheduler.ts');
const pipeline = read('lib/offlineWarmingPipeline.ts');
const storage = read('lib/offlineStoragePressure.ts');
const engine = read('lib/warmingEngine.ts');
check('offline hub is pinned outside route budgets', planner.includes("PINNED_OFFLINE_ROUTES = ['/offline']") && planner.includes('...pinned'));
check('public essential routes are protected from usage-based displacement', planner.includes('PROTECTED_PUBLIC_WARMING_ROUTES') && planner.includes('protectedSelected'));
check('route warming aborts when browser is offline', routeShells.includes('if (!navigator.onLine) return;'));
check('scheduler does not queue warming on offline network policy', scheduler.includes("policy.tier === 'offline' || !policy.allowBackgroundWarming"));
check('pipeline re-checks connectivity immediately before warming', pipeline.includes('if (!navigator.onLine) return { ran: false };'));
check('storage pressure degrades to public-only before fully pausing', storage.includes("return 'public-only'") && storage.includes("return 'paused'"));
check('warming engine processes core data before public and personal route jobs', engine.indexOf("['core-data'") < engine.indexOf("['public-routes'") && engine.indexOf("['public-routes'") < engine.indexOf("['personal-routes'"));

for (const item of checks) console.log(`[offline-ux-3-4] ${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (checks.some((item) => !item.ok)) process.exit(1);
console.log(`[offline-ux-3-4] PASS ${checks.length} checks`);
