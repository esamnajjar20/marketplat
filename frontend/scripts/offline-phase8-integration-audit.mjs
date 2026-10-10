/** Dependency-free guardrails for phase 8 browser integration coverage. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const spec = read('e2e/tests/offline-phase8.integration.spec.ts');
const config = read('playwright.config.ts');
const sw = read('public/sw.js');
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

check('phase 8 suite uses real Playwright browser contexts, not mocked app modules', spec.includes("from '@playwright/test'") && !spec.includes('vi.mock('));
check('test verifies active service worker controls the page before offline reload', spec.includes('navigator.serviceWorker.ready') && spec.includes('navigator.serviceWorker.controller') && spec.includes('context.setOffline(true)'));
check('offline reload asserts cached offline hub content and offline status', spec.includes("page.reload()") && spec.includes("name: 'جاهزية التطبيق بدون نت'") && spec.includes("'بدون نت'"));
check('connectivity is restored in a finally block', spec.includes('finally {') && spec.includes('await context.setOffline(false)'));
check('API failure integration case exercises a real API-driven listing and asserts its error state', spec.includes("page.route('**/api/**'") && spec.includes("route.abort('failed')") && spec.includes("page.goto('/products')") && spec.includes('interceptedApiRequests') && spec.includes('حدث خطأ أثناء تحميل المنتجات'));
const apiFailureTestStart = spec.indexOf("test('the products listing exposes its error state when its API request fails'");
const apiFailureTestEnd = spec.indexOf("\n  });", apiFailureTestStart);
const apiFailureTest = apiFailureTestStart >= 0 && apiFailureTestEnd >= 0
  ? spec.slice(apiFailureTestStart, apiFailureTestEnd)
  : '';
check('API failure route is installed before the products page navigation', apiFailureTest.indexOf("page.route('**/api/**'") >= 0 && apiFailureTest.indexOf("page.route('**/api/**'") < apiFailureTest.indexOf("page.goto('/products')"));
check('API failure test confirms the API request was actually intercepted', apiFailureTest.includes('await expect.poll(() => interceptedApiRequests') && apiFailureTest.includes('interceptedApiRequests += 1'));
check('API failure test avoids reload after installing page-level routing', apiFailureTest.includes("page.goto('/products')") && !apiFailureTest.includes('page.reload()'));
check('Playwright uses production build/start by default', config.includes('npm run build && npm run start'));
check('service worker contains a navigation fallback to the offline URL', sw.includes('const OFFLINE_URL = \'/offline\'') && sw.includes('cache.match(OFFLINE_URL)'));
const routeShells = read('lib/offlineRouteShells.ts');
check('failed route refresh preserves cached dependency URLs from orphan sweeping', routeShells.includes('WARM-FAILED-ROUTE-KEEP-01') && routeShells.includes('const previousHtml = await staticCache.match(route)') && routeShells.includes('liveUrls.push(...prior.chunks.map(toPath))'));
check('single-route cache clearing preserves chunks referenced by other cached routes', routeShells.includes('const sharedChunks = new Set<string>()') && routeShells.includes('if (sharedChunks.has(u)) continue;'));
check('failed manual retry preserves old shell dependency metadata when old HTML remains cached', routeShells.includes('previousHtmlStillCached') && routeShells.includes('prior?.chunks ?? []') && !routeShells.includes('delete snap.routes[route]'));

for (const item of checks) console.log(`[offline-phase8] ${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (checks.some((item) => !item.ok)) process.exit(1);
console.log(`[offline-phase8] PASS ${checks.length} checks`);
