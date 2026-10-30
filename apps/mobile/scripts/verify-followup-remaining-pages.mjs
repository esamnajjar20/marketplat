#!/usr/bin/env node
/** Regression guard for the non-homepage follow-up remediation. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = join(import.meta.dirname, '..');
const read = (path) => readFile(join(root, path), 'utf8');
const checks = [];
function check(name, fn) { fn(); checks.push(name); console.log(`✅ ${name}`); }

const savedPage = await read('app/saved-payments.tsx');
const savedStore = await read('src/storage/saved-payments.store.ts');
const cleanup = await read('src/storage/public-cache.ts');
const shared = await read('app/shared.tsx');
const sharedDecoder = await read('src/features/sharing/shared-payload.ts');
const stats = await read('app/store/[slug]/stats.tsx');
const profile = await read('app/complete-profile.tsx');
const account = await read('app/account.tsx');
const settings = await read('app/settings.tsx');
const products = await read('app/products.tsx');
const providers = await read('app/service-providers.tsx');
const providerDetail = await read('app/service-providers/[id].tsx');
const storeDetail = await read('app/stores/[id].tsx');
const webLinks = await read('src/lib/web-links.ts');

check('saved payments use SQLCipher-backed encrypted database', () => {
  assert.match(savedStore, /openEncryptedDatabaseAsync/);
  assert.match(savedStore, /owner_id TEXT NOT NULL/);
  assert.match(savedPage, /لا نخزّن كلمات مرور أو CVV/);
  assert.doesNotMatch(savedStore, /password|cvv|card_pan/i);
});
check('saved payments are account-scoped and removed during private-data cleanup', () => {
  assert.match(savedStore, /WHERE owner_id = \?/);
  assert.match(cleanup, /mobile_saved_payees/);
  assert.match(cleanup, /mobile_saved_net_cards/);
});
check('saved payments page exposes add, edit, search, and confirmed delete flows', () => {
  assert.match(savedPage, /حفظ جهة الدفع/);
  assert.match(savedPage, /حفظ البطاقة/);
  assert.match(savedPage, /تعديل/);
  assert.match(savedPage, /تأكيد الحذف/);
  assert.match(savedPage, /بحث في المحفوظات/);
});
check('mobile share receiver validates versioned web-compatible payloads', () => {
  assert.match(sharedDecoder, /parsed\.v !== 1/);
  assert.match(sharedDecoder, /MAX_ENCODED/);
  assert.match(shared, /Linking\.getInitialURL/);
  assert.match(shared, /sharedPayloadFromUrl/);
});
check('public store stats use the existing public API endpoint and slug route', () => {
  assert.match(stats, /\/api\/v1\/public\/stores\//);
  assert.match(storeDetail, /store\/\[slug\]\/stats/);
});
check('profile completion uses the existing authenticated profile update contract', () => {
  assert.match(profile, /updateMyProfile/);
  assert.match(profile, /city:city\.trim\(\)/);
  assert.match(profile, /updateUser\(\{name:updated\.name,needsProfileCompletion:false\}\)/);
});
check('new pages are reachable from Account Hub and Settings', () => {
  assert.match(account, /path: '\/saved-payments'/);
  assert.match(account, /path: '\/following'/);
  assert.match(account, /path: '\/seller-dashboard'/);
  assert.match(settings, /router\.push\('\/saved-payments'\)/);
});
check('shared ProductCard and RatingStars are adopted by catalog and rating surfaces', () => {
  assert.match(products, /<ProductCard/);
  assert.match(providers, /<RatingStars/);
  assert.match(providerDetail, /<RatingStars/);
  assert.match(storeDetail, /<RatingStars/);
});
check('legal links resolve against validated environment-specific web origin', () => {
  assert.match(webLinks, /EXPO_PUBLIC_WEB_URL/);
  assert.match(settings, /getConfiguredWebUrl\('\/privacy'\)/);
  assert.match(settings, /getConfiguredWebUrl\('\/terms'\)/);
});
console.log(`\nRemaining-pages remediation checks: ${checks.length}/${checks.length} passed.`);
