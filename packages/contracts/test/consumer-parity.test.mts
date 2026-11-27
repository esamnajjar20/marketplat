import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFile(resolve(repoRoot, path), 'utf8');

test('API pagination delegates to the single shared contract', async () => {
  const [shared, api] = await Promise.all([
    read('packages/contracts/src/pagination.ts'),
    read('apps/api/src/shared/http/pagination.ts'),
  ]);
  assert.match(shared, /numericQuery\(1000\)/);
  assert.match(shared, /numericQuery\(100\)/);
  assert.match(shared, /hasNextPage: z\.boolean\(\)\.optional\(\)/);
  assert.match(shared, /hasPrevPage: z\.boolean\(\)\.optional\(\)/);
  assert.match(shared, /nextCursor: z\.string\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(api, /export \{ paginationQuerySchema, type PaginationQuery \} from '@marketplat\/contracts'/);
  assert.doesNotMatch(api, /const paginationQuerySchema/);
});

test('mobile response validation consumes shared pagination metadata', async () => {
  const [mobile, shared] = await Promise.all([
    read('apps/mobile/src/api/response-schemas.ts'),
    read('packages/contracts/src/pagination.ts'),
  ]);
  assert.match(mobile, /import \{[^}]*paginationMetaSchema[^}]*\} from '@marketplat\/contracts'/);
  assert.match(mobile, /const paginationResponseSchema = paginationMetaSchema/);
  for (const field of ['page', 'limit', 'total', 'totalPages', 'hasNextPage', 'hasPrevPage', 'nextCursor']) {
    assert.match(shared, new RegExp(`${field}: z\.`), `shared pagination schema must include ${field}`);
  }
});

test('the shared API envelope contract retains Express error fields', async () => {
  const [shared, api] = await Promise.all([
    read('packages/contracts/src/api-response.ts'),
    read('apps/api/src/shared/errors/errorResponse.ts'),
  ]);
  for (const field of ['statusCode', 'code', 'requestId', 'meta', 'errors', 'errorMeta']) {
    assert.match(shared, new RegExp(`${field}:`), `shared error contract must include ${field}`);
    assert.match(api, new RegExp(`${field}\\??:`), `Express error response must include ${field}`);
  }
});

test('web and mobile pagination types expose the shared navigation metadata', async () => {
  const [web, mobile] = await Promise.all([
    read('frontend/types/api.types.ts'),
    read('apps/mobile/src/lib/pagination.ts'),
  ]);
  for (const field of ['hasNextPage', 'hasPrevPage', 'nextCursor']) {
    assert.match(web, new RegExp(`${field}\\??:`));
    assert.match(mobile, new RegExp(`${field}\\??:`));
  }
});

test('password rules and request form rules have one shared source', async () => {
  const [sharedAuth, apiAuth, mobile, webPassword, webRequest, apiRequest] = await Promise.all([
    read('packages/contracts/src/validation/auth.ts'),
    read('apps/api/src/modules/identity/auth/auth.validation.ts'),
    read('apps/mobile/src/lib/validation.ts'),
    read('shared/password-policy.ts'),
    read('frontend/lib/requestFormValidation.ts'),
    read('apps/api/src/modules/classifieds/requests/requests.validation.ts'),
  ]);
  assert.match(sharedAuth, /COMMON_WEAK_PASSWORDS/);
  assert.match(apiAuth, /registerBodySchema/);
  assert.match(apiAuth, /passwordSchema, registerBodySchema/);
  assert.doesNotMatch(apiAuth, /COMMON_WEAK_PASSWORDS/);
  assert.match(mobile, /from '@marketplat\/contracts'/);
  assert.match(webPassword, /from '\.\.\/packages\/contracts'/);
  assert.match(webRequest, /from '@marketplat\/contracts'/);
  assert.match(apiRequest, /requestFieldsSchema/);
});

test('API list modules share strict boolean and email primitives', async () => {
  const [customers, sellers, admin, fraud, storeMembers, mobileResponse] = await Promise.all([
    read('apps/api/src/modules/commerce/customers/customers.validation.ts'),
    read('apps/api/src/modules/identity/sellers/sellers.validation.ts'),
    read('apps/api/src/modules/platform/admin/admin.validation.ts'),
    read('apps/api/src/modules/trust/fraud/fraud.validation.ts'),
    read('apps/api/src/modules/commerce/stores/store-members.validation.ts'),
    read('apps/mobile/src/api/response-schemas.ts'),
  ]);
  for (const source of [customers, sellers, admin, fraud]) {
    assert.match(source, /optionalQueryBooleanSchema/);
  }
  assert.match(storeMembers, /emailSchema/);
  assert.match(mobileResponse, /emailSchema/);
});

test('API and web share the same numeric query and form primitive validators', async () => {
  const [core, queryHelpers, ads] = await Promise.all([
    read('packages/contracts/src/validation/core.ts'),
    read('apps/api/src/shared/http/queryHelpers.ts'),
    read('apps/api/src/modules/classifieds/ads/ads.validation.ts'),
  ]);
  assert.match(core, /export const optionalQueryNumber/);
  assert.match(core, /export const optionalQueryBooleanSchema/);
  assert.match(queryHelpers, /export \{ optionalQueryNumber \} from '@marketplat\/contracts'/);
  assert.match(ads, /parseFormBoolean/);
  assert.match(ads, /positiveMoneySchema/);
});


test('composer forms delegate static field validation to contracts package', async () => {
  const [ad, product, service, shared] = await Promise.all([
    read('frontend/components/ads/AdForm.tsx'),
    read('frontend/components/stores/ProductForm.tsx'),
    read('frontend/components/services/ServiceListingForm.tsx'),
    read('packages/contracts/src/validation/forms.ts'),
  ]);
  assert.match(ad, /adComposerFieldsSchema\.safeParse/);
  assert.match(product, /productComposerFieldsSchema\.safeParse/);
  assert.match(service, /serviceListingComposerFieldsSchema\.safeParse/);
  for (const schema of ['adComposerFieldsSchema', 'productComposerFieldsSchema', 'serviceListingComposerFieldsSchema']) {
    assert.match(shared, new RegExp(`export const ${schema} = z\\.object`));
  }
});

test('fraud and conversations use shared query parsers rather than local coercion', async () => {
  const [fraud, conversations, core] = await Promise.all([
    read('apps/api/src/modules/trust/fraud/fraud.validation.ts'),
    read('apps/api/src/modules/engagement/conversations/conversations.validation.ts'),
    read('packages/contracts/src/validation/core.ts'),
  ]);
  assert.match(fraud, /optionalQueryNumber.*@marketplat\/contracts/s);
  assert.doesNotMatch(fraud, /const optionalQueryNumber/);
  assert.match(conversations, /optionalQueryBooleanSchema/);
  assert.match(conversations, /queryBooleanSchema\.optional\(\)/);
  assert.match(core, /parseQueryBooleanInput/);
});
