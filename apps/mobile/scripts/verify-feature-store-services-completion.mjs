import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const required = [
  '../app/store-collections.tsx','../app/store-promotions.tsx','../app/store-team.tsx','../app/store-invites.tsx','../app/store-hours.tsx',
  '../app/store-collections-public.tsx','../app/collections/[id].tsx','../app/service-provider-analytics.tsx','../app/service-reviews.tsx','../app/service-images.tsx','../app/service-types.tsx','../app/service-provider-hours.tsx',
  '../src/features/commerce/store-management.api.ts','../src/features/services/service-management.api.ts',
];
for (const file of required) assert.ok(existsSync(new URL(file, import.meta.url)), `Missing ${file}`);
const storeApi = read('../src/features/commerce/store-management.api.ts');
for (const endpoint of ['/api/v1/collections/me','/api/v1/promotions/me','/member-invites','/api/v1/stores/me']) assert.ok(storeApi.includes(endpoint), `Missing store endpoint ${endpoint}`);
const serviceApi = read('../src/features/services/service-management.api.ts');
for (const endpoint of ['/api/v1/service-reviews/seller/','/api/v1/service-providers/me/analytics','/images/reorder','/api/v1/service-providers/me/logo']) assert.ok(serviceApi.includes(endpoint), `Missing service endpoint ${endpoint}`);
const myStore = read('../app/my-store.tsx');
for (const route of ['/store-collections','/store-promotions','/store-team','/store-hours','/store-invites']) assert.ok(myStore.includes(route), `Missing store navigation ${route}`);
const providerApi = read('../src/features/services/providers.api.ts');
assert.ok(providerApi.includes('updateMyServiceProviderWorkingHours'));
const serviceProfile = read('../app/service-provider-profile.tsx');
assert.ok(serviceProfile.includes('/service-provider-analytics'));
assert.ok(serviceProfile.includes('/service-types'));
assert.ok(serviceProfile.includes('/service-provider-hours'));
const serviceEditor = read('../app/service-editor.tsx');
assert.ok(serviceEditor.includes('/service-images'));
console.log('Store and services remaining pages verification passed (28 checks).');
