import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFile(join(root, path), 'utf8');

function enumValues(source, enumName) {
  const block = source.match(new RegExp(`enum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  assert.ok(block, `Prisma enum ${enumName} must exist`);
  return block.split(/\r?\n/)
    .map(line => line.replace(/\/\/.*$/, '').trim())
    .map(line => line.match(/^([A-Z][A-Z0-9_]*)\b/)?.[1])
    .filter(Boolean)
    .sort();
}

function contractValues(source, constantName) {
  const block = source.match(new RegExp(`export const ${constantName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`))?.[1];
  assert.ok(block, `Shared contract constant ${constantName} must exist`);
  return [...block.matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
}

async function walkFiles(dir, extensions) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walkFiles(path, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) output.push(path);
  }
  return output;
}

async function walkTs(dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' && dir.endsWith('/node_modules')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walkTs(path));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) output.push(path);
  }
  return output;
}

test('shared domain enums match Prisma exactly', async () => {
  const [prisma, domain] = await Promise.all([
    read('apps/api/prisma/schema.prisma'),
    read('packages/contracts/src/domain.ts'),
  ]);
  const mappings = {
    Role: 'USER_ROLES', RequestType: 'REQUEST_TYPES', RequestStatus: 'REQUEST_STATUSES',
    RequestOfferStatus: 'REQUEST_OFFER_STATUSES', AdStatus: 'AD_STATUSES', AdCondition: 'AD_CONDITIONS',
    ReportStatus: 'REPORT_STATUSES', ReportReason: 'REPORT_REASONS', ReportTargetType: 'REPORT_TARGET_TYPES',
    ServiceBusinessType: 'SERVICE_BUSINESS_TYPES', ServiceAvailability: 'SERVICE_AVAILABILITIES',
    ServicePricingType: 'SERVICE_PRICING_TYPES', ServiceListingStatus: 'SERVICE_LISTING_STATUSES',
    ServiceLocationType: 'SERVICE_LOCATION_TYPES', ServiceRequestStatus: 'SERVICE_REQUEST_STATUSES',
    AppointmentStatus: 'APPOINTMENT_STATUSES', StoreMemberRole: 'STORE_MEMBER_ROLES',
    StoreMemberStatus: 'STORE_MEMBER_STATUSES', StoreStatus: 'STORE_STATUSES', StorePlan: 'STORE_PLANS',
    ProductAvailability: 'PRODUCT_AVAILABILITIES', DiscountType: 'DISCOUNT_TYPES', PromotionStatus: 'PROMOTION_STATUSES',
    ProductStatus: 'PRODUCT_STATUSES', MarketplaceOrderStatus: 'MARKETPLACE_ORDER_STATUSES',
    SaleEntityType: 'SALE_ENTITY_TYPES', SalePaymentStatus: 'SALE_PAYMENT_STATUSES',
    SaleTransferMethod: 'SALE_TRANSFER_METHODS', InstallmentStatus: 'INSTALLMENT_STATUSES', ReturnReason: 'RETURN_REASONS',
    SellerVerificationStatus: 'SELLER_VERIFICATION_STATUSES',
    SellerVerificationStatus: 'SELLER_VERIFICATION_STATUSES',
    FavoriteEntityType: 'FAVORITE_ENTITY_TYPES', StoreFieldType: 'STORE_FIELD_TYPES', StoreFieldScope: 'STORE_FIELD_SCOPES',
    StoryVisibility: 'STORY_VISIBILITIES', FollowTargetType: 'FOLLOW_TARGET_TYPES', UserActivityType: 'USER_ACTIVITY_TYPES',
    ActivityEntityType: 'ACTIVITY_ENTITY_TYPES', FraudSignalType: 'FRAUD_SIGNAL_TYPES',
    ServiceTypeFieldType: 'SERVICE_TYPE_FIELD_TYPES', ServiceTypeFieldScope: 'SERVICE_TYPE_FIELD_SCOPES',
    AuditEventType: 'AUDIT_EVENT_TYPES', AnalyticsEventType: 'ANALYTICS_EVENT_TYPES',
    SalesAutomationEventType: 'SALES_AUTOMATION_EVENT_TYPES',
  };
  for (const [prismaEnum, contractConstant] of Object.entries(mappings)) {
    assert.deepEqual(contractValues(domain, contractConstant), enumValues(prisma, prismaEnum), `${prismaEnum} must be in parity`);
  }
});


test('every Prisma enum has exactly one canonical shared contract', async () => {
  const [prisma, domain, notifications] = await Promise.all([
    read('apps/api/prisma/schema.prisma'), read('packages/contracts/src/domain.ts'), read('packages/contracts/src/notifications.ts'),
  ]);
  const enumNames = [...prisma.matchAll(/enum\s+(\w+)\s*\{/g)].map((match) => match[1]).sort();
  const contractMappings = {
    FavoriteEntityType: 'FAVORITE_ENTITY_TYPES', RequestType: 'REQUEST_TYPES', RequestStatus: 'REQUEST_STATUSES',
    RequestOfferStatus: 'REQUEST_OFFER_STATUSES', StoreFieldType: 'STORE_FIELD_TYPES', StoreFieldScope: 'STORE_FIELD_SCOPES',
    StoryVisibility: 'STORY_VISIBILITIES', FollowTargetType: 'FOLLOW_TARGET_TYPES', UserActivityType: 'USER_ACTIVITY_TYPES',
    ActivityEntityType: 'ACTIVITY_ENTITY_TYPES', Role: 'USER_ROLES', AdStatus: 'AD_STATUSES', AdCondition: 'AD_CONDITIONS',
    ReportStatus: 'REPORT_STATUSES', ReportReason: 'REPORT_REASONS', ReportTargetType: 'REPORT_TARGET_TYPES',
    FraudSignalType: 'FRAUD_SIGNAL_TYPES', SellerVerificationStatus: 'SELLER_VERIFICATION_STATUSES',
    ServiceBusinessType: 'SERVICE_BUSINESS_TYPES', ServiceTypeFieldType: 'SERVICE_TYPE_FIELD_TYPES',
    ServiceTypeFieldScope: 'SERVICE_TYPE_FIELD_SCOPES', ServiceAvailability: 'SERVICE_AVAILABILITIES',
    ServicePricingType: 'SERVICE_PRICING_TYPES', ServiceListingStatus: 'SERVICE_LISTING_STATUSES',
    ServiceLocationType: 'SERVICE_LOCATION_TYPES', ServiceRequestStatus: 'SERVICE_REQUEST_STATUSES',
    AppointmentStatus: 'APPOINTMENT_STATUSES', StoreMemberRole: 'STORE_MEMBER_ROLES', StoreMemberStatus: 'STORE_MEMBER_STATUSES',
    StoreStatus: 'STORE_STATUSES', StorePlan: 'STORE_PLANS', ProductAvailability: 'PRODUCT_AVAILABILITIES',
    DiscountType: 'DISCOUNT_TYPES', PromotionStatus: 'PROMOTION_STATUSES', ProductStatus: 'PRODUCT_STATUSES',
    AuditEventType: 'AUDIT_EVENT_TYPES', AnalyticsEventType: 'ANALYTICS_EVENT_TYPES',
    MarketplaceOrderStatus: 'MARKETPLACE_ORDER_STATUSES', SaleEntityType: 'SALE_ENTITY_TYPES',
    SalePaymentStatus: 'SALE_PAYMENT_STATUSES', SaleTransferMethod: 'SALE_TRANSFER_METHODS',
    InstallmentStatus: 'INSTALLMENT_STATUSES', ReturnReason: 'RETURN_REASONS', SalesAutomationEventType: 'SALES_AUTOMATION_EVENT_TYPES',
  };
  assert.deepEqual(Object.keys(contractMappings).sort().concat('NotificationType').sort(), enumNames,
    'the test must account for every Prisma enum without omissions');
  for (const [enumName, constantName] of Object.entries(contractMappings)) {
    assert.deepEqual(contractValues(domain, constantName), enumValues(prisma, enumName), `${enumName} must be exact`);
  }
  const notifyValues = contractValues(notifications, 'NOTIFICATION_TYPES');
  assert.deepEqual(notifyValues, enumValues(prisma, 'NotificationType'));
});

test('assignable roles are a deliberate subset of the canonical role contract', async () => {
  const domain = await read('packages/contracts/src/domain.ts');
  assert.deepEqual(contractValues(domain, 'ASSIGNABLE_USER_ROLES'), ['ADMIN', 'MODERATOR', 'USER']);
  assert.match(domain, /export const assignableUserRoleSchema = z\.enum\(ASSIGNABLE_USER_ROLES\)/);
  assert.match(await read('apps/api/src/modules/platform/admin/admin.validation.ts'), /assignableRoleSchema = assignableUserRoleSchema/);
});

test('domain label maps include all values required by their matching Prisma enums', async () => {
  const [domain, prisma] = await Promise.all([read('packages/contracts/src/domain.ts'), read('apps/api/prisma/schema.prisma')]);
  const mappings = {
    Role: 'role', AdStatus: 'ad', AdCondition: 'adCondition', RequestType: 'requestType',
    RequestStatus: 'request', RequestOfferStatus: 'offer', ServiceRequestStatus: 'serviceRequest',
    AppointmentStatus: 'appointment', MarketplaceOrderStatus: 'order', ReportStatus: 'report',
    ReportReason: 'reportReason', ReportTargetType: 'reportTargetType', StoreMemberRole: 'storeMemberRole',
    StoreMemberStatus: 'storeMember', StoreStatus: 'store', PromotionStatus: 'promotion', ProductStatus: 'product',
    SalePaymentStatus: 'salePayment', InstallmentStatus: 'installment', SaleEntityType: 'saleEntity',
    SaleTransferMethod: 'paymentMethod', ReturnReason: 'returnReason', FraudSignalType: 'fraudSignal', AuditEventType: 'auditEvent',
  };
  for (const [enumName, mapName] of Object.entries(mappings)) {
    const values = enumValues(prisma, enumName);
    const map = domain.match(new RegExp(`\\b${mapName}:\\s*\\{([^}]+)\\}`))?.[1];
    assert.ok(map, `Shared labels ${mapName} must exist`);
    for (const value of values) assert.match(map, new RegExp(`\\b${value}:`), `${mapName}.${value} label is missing`);
  }
});

test('web and mobile use shared domain types rather than redeclaring audited enums', async () => {
  const paths = [
    'frontend/types/auth.types.ts', 'frontend/types/admin.types.ts', 'frontend/types/ad.types.ts',
    'frontend/types/activity.types.ts', 'frontend/types/store.types.ts', 'frontend/types/favorite.types.ts',
    'frontend/types/filter.types.ts', 'frontend/api/stories.api.ts', 'frontend/api/follows.api.ts',
    'frontend/api/marketplaceOrders.api.ts', 'frontend/lib/analytics.ts',
    'frontend/types/request.types.ts', 'frontend/types/service.types.ts', 'frontend/types/store.types.ts',
    'frontend/types/store-member.types.ts', 'frontend/types/product.types.ts', 'frontend/types/promotion.types.ts',
    'frontend/types/sale.types.ts', 'frontend/types/installment.types.ts', 'frontend/types/seller.types.ts',
    'apps/mobile/src/features/auth/auth.api.ts', 'apps/mobile/src/features/requests/requests.api.ts',
    'apps/mobile/src/features/commerce/orders.api.ts', 'apps/mobile/src/features/sales/sales.api.ts',
    'apps/mobile/src/features/account/social.api.ts',
  ];
  const sources = await Promise.all(paths.map(read));
  const combined = sources.join('\n');
  for (const typeName of ['UserRole', 'RequestOfferStatus', 'RequestStatus', 'RequestType', 'AdStatus', 'AdCondition', 'ServiceRequestStatus', 'AppointmentStatus', 'StoreStatus', 'StoreMemberStatus', 'ProductStatus', 'PromotionStatus', 'SalePaymentStatus', 'InstallmentStatus']) {
    assert.match(combined, new RegExp(`from ['"]@marketplat/contracts['"]`), 'consumer files should import shared contracts');
    assert.doesNotMatch(combined, new RegExp(`export type ${typeName}\\s*=\\s*['"]`), `${typeName} must not be locally redefined`);
  }
});

test('mobile and web share API envelopes, pagination metadata and display formatters', async () => {
  const [apiEnvelope, webApi, mobileApi, mobilePaging, webFormat, mobileFormat, sharedFormat, notificationMeta] = await Promise.all([
    read('packages/contracts/src/api-response.ts'), read('frontend/types/api.types.ts'), read('apps/mobile/src/api/contracts.ts'),
    read('apps/mobile/src/lib/pagination.ts'), read('frontend/lib/formatters.ts'), read('apps/mobile/src/lib/formatters.ts'),
    read('packages/contracts/src/formatters.ts'), read('frontend/lib/notificationMeta.ts'),
  ]);
  assert.match(webApi, /ApiSuccessEnvelope/);
  assert.match(mobileApi, /ApiSuccessEnvelope/);
  assert.match(mobilePaging, /type PageMetaLike = PaginationMeta/);
  assert.match(apiEnvelope, /apiErrorResponseSchema/);
  assert.match(webFormat, /from '@marketplat\/contracts'/);
  assert.match(mobileFormat, /from '@marketplat\/contracts'/);
  assert.match(sharedFormat, /timeZone: MARKET_TIME_ZONE/);
  assert.match(sharedFormat, /maximumFractionDigits = 2/);
  assert.match(notificationMeta, /calendarDayDifference/);
  assert.match(mobileFormat, /kind: DateFormatKind = 'date'/);
});


test('API validation consumes canonical enum schemas instead of duplicating Prisma values', async () => {
  const checks = {
    'apps/api/src/modules/classifieds/requests/requests.validation.ts': ['requestTypeSchema', 'requestStatusSchema', 'requestOfferStatusSchema'],
    'apps/api/src/modules/commerce/store-types/store-type-fields.validation.ts': ['storeFieldTypeSchema', 'storeFieldScopeSchema'],
    'apps/api/src/modules/discovery/search/search.validation.ts': ['adConditionSchema'],
    'apps/api/src/modules/discovery/search/search.facets.validation.ts': ['adConditionSchema'],
    'apps/api/src/modules/identity/sellers/sellers.validation.ts': ['sellerVerificationStatusSchema'],
    'apps/api/src/modules/services/service-types/service-types.validation.ts': ['servicePricingTypeSchema', 'serviceLocationTypeSchema'],
    'apps/api/src/modules/services/service-providers/service-providers.validation.ts': ['serviceBusinessTypeSchema', 'serviceAvailabilitySchema', 'serviceListingStatusSchema'],
    'apps/api/src/modules/services/service-listings/service-listings.validation.ts': ['serviceListingStatusSchema.exclude'],
    'apps/api/src/modules/services/service-requests/service-requests.validation.ts': ['serviceRequestStatusSchema.exclude'],
    'apps/api/src/modules/services/appointments/appointments.validation.ts': ['appointmentStatusSchema.exclude'],
  };
  for (const [path, tokens] of Object.entries(checks)) {
    const source = await read(path);
    for (const token of tokens) assert.ok(source.includes(token), `${path} must consume ${token}`);
  }
});

test('mobile entity API shapes use strict shared Prisma enum types', async () => {
  const checks = {
    'apps/mobile/src/features/auth/auth.api.ts': ['ApiSuccessEnvelope', 'UserIdentityContract'],
    'apps/mobile/src/features/commerce/commerce.api.ts': ['ProductAvailability', 'ProductStatus', 'StoreStatus', 'StorePlan', 'StoreFieldType', 'StoreFieldScope'],
    'apps/mobile/src/features/commerce/store-management.api.ts': ['PromotionStatus', 'StoreMemberRole', 'StoreMemberStatus', 'DiscountType'],
    'apps/mobile/src/features/services/services.api.ts': ['ServiceListingStatus', 'ServiceRequestStatus', 'AppointmentStatus', 'ServicePricingType', 'ServiceLocationType'],
    'apps/mobile/src/features/sales/sales.api.ts': ['SaleEntityType', 'SalePaymentStatus'],
    'apps/mobile/src/features/sales/sales-extra.api.ts': ['InstallmentStatus', 'SaleTransferMethod', 'ReturnReason'],
    'apps/mobile/src/features/stories/stories.api.ts': ['StoryVisibility'],
    'apps/mobile/src/features/ads/ads.api.ts': ['AdCondition', 'AdStatus'],
    'apps/mobile/src/features/discovery/discovery.api.ts': ['AdCondition'],
  };
  for (const [path, tokens] of Object.entries(checks)) {
    const source = await read(path);
    for (const token of tokens) assert.ok(source.includes(token), `${path} must use ${token}`);
  }
});

test('mobile API clients do not create their own envelope or pagination interfaces', async () => {
  const files = await walkTs(join(root, 'apps/mobile/src'));
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /(?:type|interface)\s+(?:ApiEnvelope|Envelope)\s*<[^>]*>\s*=\s*\{/,
      `${file.replace(root + '/', '')} contains a duplicate API envelope shape`);
  }
});

test('cache-key copies remain byte-identical while cache stores remain platform-local', async () => {
  const paths = ['shared/cache/cacheKey.ts', 'frontend/lib/cache/cacheKey.ts', 'apps/api/src/shared/cache/cacheKey.ts'];
  const contents = await Promise.all(paths.map(read));
  assert.equal(new Set(contents).size, 1, 'all copies of the canonical cache-key algorithm must match');
});

test('session authentication rejects inactive Redis-backed sessions fail-closed', async () => {
  const middleware = await read('apps/api/src/middlewares/auth.middleware.ts');
  assert.match(middleware, /getSessionMetadataKey\(payload\.userId, payload\.sessionId\)/);
  assert.match(middleware, /sessionExists\s*!==\s*1/);
  assert.match(middleware, /Redis|redis/i);
});

test('offline ad-image idempotency ledger is consumed and intentionally survives ad/user deletion', async () => {
  const [schema, repository, service, migration] = await Promise.all([
    read('apps/api/prisma/schema.prisma'), read('apps/api/src/modules/classifieds/ads/ads.repository.ts'),
    read('apps/api/src/modules/classifieds/ads/ads.service.ts'),
    read('apps/api/prisma/migrations/20261025100000_add_ad_image_offline_idempotency/migration.sql'),
  ]);
  assert.match(schema, /model AdImageOfflineOperation/);
  assert.match(repository, /adImageOfflineOperation\.(?:findUnique|create|delete)/);
  assert.match(service, /adImageOfflineOperation|offlineOperation/i);
  assert.match(migration, /idempotency|ledger|replay|no foreign key/i);
});


test('web domain-label consumers delegate enum labels to the shared contract', async () => {
  const consumers = {
    'frontend/lib/constants.ts': ['reportReason', 'report'],
    'frontend/lib/storeStatus.ts': ['store', 'storeMember'],
    'frontend/components/orders/MarketplaceOrdersPage.tsx': ['order'],
    'frontend/components/orders/MarketplaceOrderDetailPage.tsx': ['order'],
    'frontend/components/services/MyServiceListingsList.tsx': ['serviceListing'],
    'frontend/components/services/ServiceListingForm.tsx': ['servicePricing', 'serviceLocation'],
    'frontend/components/services/ServiceListingDetail.tsx': ['serviceLocation'],
    'frontend/components/stores/MyProductsList.tsx': ['product', 'productAvailability'],
    'frontend/components/stores/MyStoreInventory.tsx': ['productAvailability'],
    'frontend/components/stores/ProductForm.tsx': ['productAvailability'],
    'frontend/components/stores/MyPromotionsList.tsx': ['promotion'],
    'frontend/components/stores/PromotionForm.tsx': ['discountType'],
    'frontend/components/shared/ReportButton.tsx': ['reportReason'],
    'frontend/components/admin/AdminReportsTable.tsx': ['reportTargetType'],
    'frontend/components/admin/AdminReportRow.tsx': ['reportTargetType'],
    'frontend/components/profile/MyReportsList.tsx': ['reportTargetType'],
    'frontend/components/stores/MyMemberInvites.tsx': ['storeMemberRole'],
    'frontend/components/stores/MyStoreMembersList.tsx': ['storeMemberRole'],
    'frontend/components/sales/payments/PaymentStatusBadge.tsx': ['salePayment'],
  };
  for (const [path, keys] of Object.entries(consumers)) {
    const source = await read(path);
    assert.match(source, /DOMAIN_STATUS_LABELS/, `${path} must import shared labels`);
    for (const key of keys) assert.match(source, new RegExp(`DOMAIN_STATUS_LABELS\.${key}`), `${path} must use shared ${key} labels`);
  }
});

test('platform formatters keep the same precision, null handling and timezone defaults', async () => {
  const [web, mobile, shared] = await Promise.all([
    read('frontend/lib/formatters.ts'), read('apps/mobile/src/lib/formatters.ts'), read('packages/contracts/src/formatters.ts'),
  ]);
  assert.match(web, /formatCurrencyValue\(value, currency, 'غير متاح'\)/);
  assert.match(mobile, /formatCurrencyValue\(value, currency, 'غير متاح'\)/);
  assert.match(web, /formatNumberValue\(value, 2, '--'\)/);
  assert.match(mobile, /formatNumberValue\(value, maximumFractionDigits, '--'\)/);
  assert.match(mobile, /maximumFractionDigits = 2/);
  assert.match(web, /Asia\/Gaza|calendarDayDifference/);
  assert.match(mobile, /kind: DateFormatKind = 'date'/);
  assert.match(shared, /timeZone: MARKET_TIME_ZONE/);
});


test('role hierarchy is shared by the backend and web authorization affordances', async () => {
  const [sharedRoles, apiRoles, apiPolicy, webRow, webTable] = await Promise.all([
    read('packages/contracts/src/roles.ts'), read('apps/api/src/shared/constants/roles.ts'),
    read('apps/api/src/shared/auth/roleHierarchy.ts'), read('frontend/components/admin/AdminUserRow.tsx'),
    read('frontend/components/admin/AdminUsersTable.tsx'),
  ]);
  assert.match(sharedRoles, /export const ROLE_RANK/);
  assert.match(sharedRoles, /export function canManageRole/);
  assert.match(apiRoles, /from '@marketplat\/contracts'/);
  assert.match(apiRoles, /export \{ ROLE_RANK, isAdminTier \}/);
  assert.match(apiPolicy, /export \{ canManageRole \}/);
  assert.match(webRow, /import \{ canManageRole, DOMAIN_STATUS_LABELS \}/);
  assert.match(webTable, /import \{ canManageRole, DOMAIN_STATUS_LABELS \}/);
  assert.doesNotMatch(webTable, /function canManageRole\(/);
  assert.doesNotMatch(webRow, /function canManageRole\(/);
});

test('generic mobile statuses delegate to a shared fallback and domain-specific labels', async () => {
  const [sharedDomain, mobileLabels] = await Promise.all([
    read('packages/contracts/src/domain.ts'), read('apps/mobile/src/lib/status-labels.ts'),
  ]);
  assert.match(sharedDomain, /export const GENERIC_STATUS_LABELS/);
  assert.match(mobileLabels, /GENERIC_STATUS_LABELS/);
  assert.match(mobileLabels, /Object\.values\(DOMAIN_STATUS_LABELS\)/);
  assert.doesNotMatch(mobileLabels, /const STATUS_LABELS: Record<string, string> = \{/);
});

test('Go worker notification types and preference keys remain within the shared contract', async () => {
  const [notifications, goFiles] = await Promise.all([
    read('packages/contracts/src/notifications.ts'),
    walkFiles(join(root, 'apps/go-worker'), ['.go', '.sql']),
  ]);
  const typeBlock = notifications.match(/export const NOTIFICATION_TYPES\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1];
  const preferenceBlock = notifications.match(/export const NOTIFICATION_PREFERENCE_DEFAULTS\s*=\s*\{([\s\S]*?)\}\s*as const/)?.[1];
  assert.ok(typeBlock, 'shared notification type list must exist');
  assert.ok(preferenceBlock, 'shared notification preference defaults must exist');
  const allowedTypes = new Set([...typeBlock.matchAll(/['"]([A-Z][A-Z0-9_]*)['"]/g)].map((match) => match[1]));
  const allowedPreferences = new Set([...preferenceBlock.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]));
  const usedTypes = new Set();
  const usedPreferences = new Set();
  for (const file of goFiles) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/['"]([A-Z][A-Z0-9_]*)['"]\s*::\s*"?NotificationType"?/g)) {
      usedTypes.add(match[1]);
    }
    for (const line of source.split(/\r?\n/)) {
      if (!/notificationPreferences/i.test(line)) continue;
      for (const match of line.matchAll(/->>\s*'([A-Za-z][A-Za-z0-9]*)'/g)) usedPreferences.add(match[1]);
    }
  }
  assert.ok(usedTypes.size > 0, 'Go worker must contain notification type usage');
  assert.ok(usedPreferences.size > 0, 'Go worker must contain notification preference usage');
  assert.deepEqual([...usedTypes].filter((value) => !allowedTypes.has(value)).sort(), [], 'Go notification types must exist in shared contract');
  assert.deepEqual([...usedPreferences].filter((value) => !allowedPreferences.has(value)).sort(), [], 'Go preference keys must exist in shared preferences');
});


test('mobile and web marketplace views use the canonical status and report labels', async () => {
  const consumers = {
    'apps/mobile/app/orders.tsx': ['DOMAIN_STATUS_LABELS.order', 'STATUS_TONE'],
    'apps/mobile/app/seller-orders.tsx': ['DOMAIN_STATUS_LABELS.order', 'STATUS_TONE'],
    'apps/mobile/app/requests.tsx': ['DOMAIN_STATUS_LABELS.requestType'],
    'apps/mobile/app/store-team.tsx': ['DOMAIN_STATUS_LABELS.storeMemberRole', 'STORE_MEMBER_ROLES'],
    'apps/mobile/app/report/[targetType]/[targetId].tsx': ['DOMAIN_STATUS_LABELS.reportReason', 'DOMAIN_STATUS_LABELS.reportTarget'],
    'frontend/components/stores/ProductDetail.tsx': ['DOMAIN_STATUS_LABELS.productAvailability'],
    'frontend/components/stores/ProductFormPreview.tsx': ['DOMAIN_STATUS_LABELS.productAvailability'],
    'frontend/components/admin/AdminRecentActivity.tsx': ['DOMAIN_STATUS_LABELS.ad'],
  };
  for (const [path, tokens] of Object.entries(consumers)) {
    const source = await read(path);
    for (const token of tokens) assert.ok(source.includes(token), `${path} must use ${token}`);
  }
});


test('notification types, categories and preference groups form a complete shared partition', async () => {
  const [prisma, source] = await Promise.all([
    read('apps/api/prisma/schema.prisma'), read('packages/contracts/src/notifications.ts'),
  ]);
  const prismaTypes = enumValues(prisma, 'NotificationType');
  const sharedTypes = contractValues(source, 'NOTIFICATION_TYPES');
  assert.deepEqual(sharedTypes, prismaTypes, 'shared notification types must match Prisma exactly');

  const categoriesBlock = source.match(/export const NOTIFICATION_CATEGORY_TYPES\s*=\s*\{([\s\S]*?)\}\s*as const/)?.[1];
  assert.ok(categoriesBlock, 'notification category partition must exist');
  const categoryTypes = [...categoriesBlock.matchAll(/:\s*\[([\s\S]*?)\]/g)]
    .flatMap((match) => [...match[1].matchAll(/['"]([A-Z][A-Z0-9_]*)['"]/g)].map((item) => item[1]));
  assert.equal(new Set(categoryTypes).size, categoryTypes.length, 'a notification type must belong to only one category');
  assert.deepEqual([...categoryTypes].sort(), [...sharedTypes].sort(), 'every notification type must belong to exactly one category');

  const contentKeys = contractValues(source, 'NOTIFICATION_CONTENT_PREFERENCE_KEYS');
  const defaultsBlock = source.match(/export const NOTIFICATION_PREFERENCE_DEFAULTS\s*=\s*\{([\s\S]*?)\}\s*as const/)?.[1] ?? '';
  const defaultKeys = [...defaultsBlock.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]);
  assert.ok(contentKeys.every((key) => defaultKeys.includes(key)), 'every content preference must have a default');
  const groupsBlock = source.match(/export const NOTIFICATION_PREFERENCE_GROUPS\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1] ?? '';
  const groupedKeys = [...groupsBlock.matchAll(/key:\s*['"]([A-Za-z][A-Za-z0-9]*)['"]/g)].map((match) => match[1]);
  assert.deepEqual([...groupedKeys].sort(), [...contentKeys].sort(), 'each content preference must be shown in exactly one settings group');
});


test('JavaScript toolchain versions are pinned with documented platform exceptions', async () => {
  const [rootPackage, apiPackage, webPackage, mobilePackage, contractPackage, proxyPackage, nodeNvm, nodeVersion] = await Promise.all([
    read('package.json').then(JSON.parse), read('apps/api/package.json').then(JSON.parse),
    read('frontend/package.json').then(JSON.parse), read('apps/mobile/package.json').then(JSON.parse),
    read('packages/contracts/package.json').then(JSON.parse), read('workers/cf-api-proxy/package.json').then(JSON.parse),
    read('.nvmrc'), read('.node-version'),
  ]);
  assert.equal(rootPackage.engines.node, '>=22.18 <25');
  assert.equal(nodeNvm.trim(), '22.18.0');
  assert.equal(nodeVersion.trim(), '22.18.0');
  for (const [name, pkg] of [['API', apiPackage], ['Web', webPackage], ['Mobile', mobilePackage], ['Contracts', contractPackage]]) {
    assert.equal(pkg.dependencies?.zod ?? pkg.devDependencies?.zod, '3.25.76', `${name} Zod version must be aligned`);
  }
  assert.equal(apiPackage.devDependencies.typescript, '5.9.3');
  assert.equal(webPackage.devDependencies.typescript, '5.9.3');
  assert.equal(contractPackage.devDependencies.typescript, '5.9.3');
  assert.equal(proxyPackage.devDependencies.typescript, '5.9.3');
  assert.equal(mobilePackage.devDependencies.typescript, '~6.0.3', 'Expo mobile toolchain uses its peer-compatible TypeScript major');
});
