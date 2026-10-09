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
check('API failure integration case preserves the local offline surface', spec.includes("page.route('**/api/**'") && spec.includes("route.abort('failed')") && spec.includes("name: 'جاهزية التطبيق بدون نت'"));
check('Playwright uses production build/start by default', config.includes('npm run build && npm run start'));
check('service worker contains a navigation fallback to the offline URL', sw.includes('const OFFLINE_URL = \'/offline\'') && sw.includes('cache.match(OFFLINE_URL)'));

for (const item of checks) console.log(`[offline-phase8] ${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (checks.some((item) => !item.ok)) process.exit(1);
console.log(`[offline-phase8] PASS ${checks.length} checks`);
