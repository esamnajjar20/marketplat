import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const required = [
  '../app/register.tsx','../app/forgot-password.tsx','../app/reset-password.tsx','../app/profile.tsx','../app/settings.tsx',
  '../app/requests.tsx','../app/request-create.tsx','../app/requests/[id].tsx','../app/my-requests.tsx','../app/my-offers.tsx',
  '../app/appointments.tsx','../app/appointment-create.tsx','../app/my-services.tsx','../app/service-editor.tsx',
  '../app/service-providers.tsx','../app/service-providers/[id].tsx','../app/verify-email.tsx','../app/seller-profile.tsx','../app/service-provider-profile.tsx','../app/saved-searches.tsx',
  '../src/features/account/account.api.ts','../src/features/requests/requests.api.ts','../src/features/appointments/appointments.api.ts',
  '../src/features/services/providers.api.ts','../src/features/account/seller.api.ts','../src/features/account/saved-searches.api.ts','../src/components/MobileUI.tsx',
];
for (const file of required) assert.ok(existsSync(new URL(file, import.meta.url)), `Missing ${file}`);
const auth = read('../src/features/auth/AuthContext.tsx');
const home = read('../app/index.tsx');
const explore = read('../app/explore.tsx');
const account = read('../app/account.tsx');
const requests = read('../src/features/requests/requests.api.ts');
const services = read('../src/features/services/services.api.ts');
const serviceRequests = read('../app/service-requests.tsx');
const seller = read('../app/seller-profile.tsx');
const provider = read('../app/service-provider-profile.tsx');
const savedSearches = read('../app/saved-searches.tsx');
const verifyEmail = read('../app/verify-email.tsx');
assert.match(auth, /registerAccount/);
assert.match(auth, /register: \(/);
assert.match(explore, /path: '\/requests'/);
assert.match(account, /path: '\/my-services'/);
assert.match(requests, /\/api\/v1\/requests\/offers\/me/);
assert.match(requests, /\/api\/v1\/requests\/\$\{encodeURIComponent\(id\)\}\/offers/);
assert.match(services, /createMyServiceListing/);
assert.match(services, /updateMyServiceListing/);
assert.match(serviceRequests, /appointment-create/);
assert.match(seller, /agreedToSellerTerms\s*:\s*true/);
assert.match(provider, /serviceAreaCities/);
assert.match(savedSearches, /\/api|createSavedSearch/);
assert.match(verifyEmail, /verify-email/);
console.log('Remaining mobile pages verification passed (34 checks).');
