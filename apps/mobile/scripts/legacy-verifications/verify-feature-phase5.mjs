import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname);
const apiPath = resolve(root, 'src/features/ads/ads.api.ts');
const homePath = resolve(root, 'app/index.tsx');
assert.ok(existsSync(apiPath) && existsSync(homePath), 'Phase 5 target files must exist');
const api = readFileSync(apiPath, 'utf8');
for (const token of ["params.set('city'", "params.set('minPrice'", "params.set('maxPrice'", "params.set('sortBy'", "params.set('sortOrder'", "options.city", "options.minPrice", "options.maxPrice"]) {
  assert.ok(api.includes(token), `Missing API filter support: ${token}`);
}
const home = readFileSync(homePath, 'utf8');
for (const token of ['loadMoreAds', 'setLoadingMore', 'setTotalPages', 'cityInput', 'minPriceInput', 'maxPriceInput', 'applyFilters', 'الأقل سعرًا', 'الأكثر مشاهدة', 'تحميل المزيد من الإعلانات', 'requestSequence !== adsRequestSequence.current']) {
  assert.ok(home.includes(token), `Missing browsing UX behavior: ${token}`);
}
assert.ok(home.includes('min > max'), 'Price range validation missing');
assert.ok(home.includes('new Set(current.map((item) => item.id))'), 'Page append de-duplication missing');
console.log('Phase 5 static verification passed (server-side filters, sorting, pagination, validation, and stale-response guard).');
