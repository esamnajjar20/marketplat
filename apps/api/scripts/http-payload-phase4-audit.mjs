#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (name, condition, detail = '') => {
  checks.push({ name, passed: Boolean(condition), detail });
};

const repository = read('apps/api/src/modules/commerce/stores/stores.repository.ts');
const service = read('apps/api/src/modules/commerce/stores/store-members.service.ts');
const storesService = read('apps/api/src/modules/commerce/stores/stores.service.ts');
const frontendTypes = read('frontend/types/store.types.ts');
const storesApi = read('frontend/api/stores.api.ts');
const storesQuery = read('frontend/hooks/queries/useStores.ts');
const repoTests = read('apps/api/tests/unit/stores.repository.test.ts');
const accessTests = read('apps/api/tests/unit/store-members.access.test.ts');
const storesServiceTests = read('apps/api/tests/unit/stores.service.test.ts');
const frontendApiTests = read('frontend/__tests__/unit/api/stores.api.test.ts');

const projectionMatch = repository.match(/export const storeDirectorySelect = \{([\s\S]*?)\n\} as const;/);
const projection = projectionMatch?.[1] ?? '';
const requiredRootFields = ['id', 'name', 'logoUrl', 'coverImageUrl', 'city', 'status', 'plan'];
check(
  'Public store projection explicitly selects card fields',
  Boolean(projectionMatch) && requiredRootFields.every(field => new RegExp(`^\\s*${field}: true,?$`, 'm').test(projection)),
  `Required root fields: ${requiredRootFields.join(', ')}`,
);
check(
  'Public projection excludes unneeded/private store and seller fields',
  Boolean(projectionMatch)
    && !/description|address|phone|workingHours|latitude|longitude|paymentMethods|suspended|userId/.test(projection)
    && !/fields\s*:/.test(projection),
  'No address/contact/hours/geo/payment/suspension/user fields or dynamic StoreType fields selected.',
);
check(
  'Directory and featured queries use the compact projection',
  (repository.match(/prisma\.storeDetails\.findMany\(\{[\s\S]*?select: storeDirectorySelect/g) ?? []).length >= 2,
  'Both findMany and findFeatured use storeDirectorySelect.',
);
check(
  'Public store service advertises compact response types',
  /getStores:[\s\S]*?Promise<\{\s*stores:\s*StoreDirectoryRow\[\]/.test(read('apps/api/src/modules/commerce/stores/stores.service.ts'))
    && /getFeaturedStores:[\s\S]*?Promise<\{\s*stores:\s*StoreDirectoryRow\[\]/.test(read('apps/api/src/modules/commerce/stores/stores.service.ts')),
  'getStores and getFeaturedStores return StoreDirectoryRow[].',
);
check(
  'Frontend directory contract matches compact card response',
  /export type StoreDirectoryItem = Pick<StoreDetails,/.test(frontendTypes)
    && /sellerProfile:\s*Pick<SellerProfile,/.test(frontendTypes)
    && /storeType:\s*Pick<StoreType,/.test(frontendTypes)
    && /get<ApiResponse<StoreDirectoryItem\[\]>>\('\/stores'/.test(storesApi)
    && /StoreDirectoryItem/.test(storesQuery),
  'Public /stores API and query cache use StoreDirectoryItem.',
);
check(
  'Staff authorization uses one bounded ID-IN lookup',
  /const storeAccessInclude = (?:Prisma\.validator<Prisma\.StoreDetailsInclude>\(\)\()?\{[\s\S]*?sellerProfile:\s*\{\s*select:\s*\{\s*suspended:\s*true/.test(repository)
    && /findManyForStaffAccess:[\s\S]*?where:\s*\{\s*id:\s*\{\s*in:\s*storeIds\s*\}\s*\}[\s\S]*?include:\s*storeAccessInclude/.test(repository),
  'The repository loads all candidate stores and suspension flags in one Prisma findMany.',
);
check(
  'Staff capability path resolves candidate stores once and preserves membership order',
  /findManyForStaffAccess\([\s\S]{0,180}productCapable\.map\(m => m\.storeId\)/.test(service)
    && /for \(const membership of productCapable\)[\s\S]*?storesById\.get\(membership\.storeId\)/.test(service)
    && !/for \(const membership of productCapable\)[\s\S]*?await storesRepository\.findById/.test(service),
  'One batch read; iteration remains oldest-membership-first.',
);
check(
  'Store projection and staff batching have regression tests',
  /selects only card-safe seller and store-type fields/.test(repoTests)
    && /loads candidate stores and owner suspension flags in one query/.test(repoTests)
    && /batches owner access checks for all eligible memberships into one query/.test(accessTests)
    && /compact store card list/.test(frontendApiTests),
  'Repository, authorization, and frontend response contracts are guarded.',
);
check(
  'Store directory cache key is versioned with the compact response schema',
  /STORE_DIRECTORY_CACHE_VERSION = 2/.test(storesService)
    && (storesService.match(/__projectionVersion:\s*STORE_DIRECTORY_CACHE_VERSION/g) ?? []).length === 2
    && /objectContaining\(\{ __projectionVersion: 2/.test(storesServiceTests),
  'Old Redis entries with the wider public payload cannot satisfy the new directory cache key.',
);

check(
  'General store authorization joins owner identity and suspension',
  /storeAuthorizationInclude = (?:Prisma\.validator<Prisma\.StoreDetailsInclude>\(\)\()?\{[\s\S]*?userId:\s*true[\s\S]*?suspended:\s*true/.test(repository)
    && /findByIdForAccess:[\s\S]*?include:\s*storeAuthorizationInclude/.test(repository)
    && /findBySlugForAccess:[\s\S]*?include:\s*storeAuthorizationInclude/.test(repository),
  'Both id and slug lookups return owner identity and suspension in the store read.',
);
check(
  'General access gate avoids follow-up owner-profile reads',
  /resolveStore = async \(idOrSlug: string\): Promise<StoreAccessRow>[\s\S]*?findByIdForAccess[\s\S]*?findBySlugForAccess/.test(service)
    && /store\.sellerProfile\.suspended/.test(service)
    && /store\.sellerProfile\.userId === userId/.test(service)
    && !/export const requireStoreAccess = async[\s\S]*?sellersRepository\.findById/.test(service),
  'The authorization branch checks the joined profile; seller queries remain only for other business flows.',
);
check(
  'General access gate has repository and service regression tests',
  /loads owner identity and suspension with the store row/.test(repoTests)
    && /resolves an owner from the joined store row without extra seller queries/.test(accessTests)
    && /uses the joined store row for staff authorization/.test(accessTests),
  'Id lookup, owner resolution and member path are covered.',
);

check(
  'Staff batch avoids a database query for an empty candidate list',
  /storeIds\.length\s*\?\s*prisma\.storeDetails\.findMany[\s\S]*?:\s*Promise\.resolve\(\[\]\)/.test(repository)
    && /does not issue a database query for an empty id list/.test(repoTests),
  'No invalid/empty IN query is sent when there are no eligible memberships.',
);

const passed = checks.filter(item => item.passed).length;
for (const item of checks) {
  process.stdout.write(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}\n`);
}
process.stdout.write(`\nHTTP payload phase 4: ${passed}/${checks.length} checks passed.\n`);
if (passed !== checks.length) process.exitCode = 1;
