import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const app = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8'));
assert.equal(pkg.name, '@marketplat/mobile');
assert.equal(pkg.main, 'expo-router/entry');
assert.equal(app.expo.name, 'MarketPlat');
for (const file of ['app/_layout.tsx', 'app/index.tsx', 'app/ads/[id].tsx', 'src/api/client.ts', 'src/theme/tokens.ts', 'src/features/ads/ads.api.ts', 'tsconfig.json']) {
  assert.ok(existsSync(resolve(root, file)), `Missing required scaffold file: ${file}`);
}
const home = readFileSync(resolve(root, 'app/index.tsx'), 'utf8');
assert.match(home, /writingDirection: 'rtl'/);
assert.match(home, /أحدث الإعلانات/);
assert.match(home, /fetchPublicAds/);
assert.match(home, /إعادة المحاولة/);
const adsApi = readFileSync(resolve(root, 'src/features/ads/ads.api.ts'), 'utf8');
assert.match(adsApi, /\/api\/v1\/ads/);
assert.match(adsApi, /response.success !== true/);
assert.match(adsApi, /fetchAdDetail/);
const detail = readFileSync(resolve(root, 'app/ads/[id].tsx'), 'utf8');
assert.match(detail, /fetchAdDetail/);
assert.match(detail, /وصف الإعلان/);
assert.ok(home.includes('router.push(`/ads/${encodeURIComponent(ad.id)}`)'), 'Ad cards should navigate to the detail route');
console.log('Mobile scaffold and public ads API wiring checks passed (static checks only; no Expo build or live API request performed).');
