#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(mobile, '..', '..');
const read = async (root, file) => readFile(join(root, file), 'utf8');
const [apiClient, profile, completeProfile, commerceApi, membershipsApi, storesRoutes, membersController, outbox, outboxBridge, sellerDashboard, myStores, storeTeam, serviceTypes, serviceReviews, serviceRequestList, serviceRequestDetail, storeInvites, myStore, field, normalize, drawer, layout, storeDetail, storeStats, followers, following, myReports, myRequests, myOffers, sellersRanking, reportForm, requestsApi, serviceRequestsApi, addScreen, imageHelper, serviceImages, providerProfile, myStoreScreen, profileScreen, promotionsScreen, serviceRequestDetailScreen, navigationPolicy] = await Promise.all([
  read(mobile, 'src/api/client.ts'),
  read(mobile, 'app/profile.tsx'),
  read(mobile, 'app/complete-profile.tsx'),
  read(mobile, 'src/features/commerce/commerce.api.ts'),
  read(mobile, 'src/features/commerce/store-management.api.ts'),
  read(repo, 'apps/api/src/modules/stores/stores.routes.ts'),
  read(repo, 'apps/api/src/modules/stores/store-members.controller.ts'),
  read(mobile, 'src/storage/entity-create-outbox.ts'),
  read(mobile, 'src/storage/OutboxSyncLifecycleBridge.tsx'),
  read(mobile, 'app/seller-dashboard.tsx'),
  read(mobile, 'app/my-stores.tsx'),
  read(mobile, 'app/store-team.tsx'),
  read(mobile, 'app/service-types.tsx'),
  read(mobile, 'app/service-reviews.tsx'),
  read(mobile, 'app/service-requests.tsx'),
  read(mobile, 'app/service-requests/[id].tsx'),
  read(mobile, 'app/store-invites.tsx'),
  read(mobile, 'app/my-store.tsx'),
  read(mobile, 'src/components/ui/Field.tsx'),
  read(mobile, 'src/lib/normalize-numeric-input.ts'),
  read(mobile, 'src/components/MobileDrawer.tsx'),
  read(mobile, 'app/_layout.tsx'),
  read(mobile, 'app/stores/[id].tsx'),
  read(mobile, 'app/store/[slug]/stats.tsx'),
  read(mobile, 'app/profile/[id]/followers.tsx'),
  read(mobile, 'app/profile/[id]/following.tsx'),
  read(mobile, 'app/my-reports.tsx'),
  read(mobile, 'app/my-requests.tsx'),
  read(mobile, 'app/my-offers.tsx'),
  read(mobile, 'app/sellers-ranking.tsx'),
  read(mobile, 'app/report/[targetType]/[targetId].tsx'),
  read(mobile, 'src/features/requests/requests.api.ts'),
  read(mobile, 'src/features/services/services.api.ts'),
  read(mobile, 'app/add.tsx'),
  read(mobile, 'src/lib/normalize-image-asset.ts'),
  read(mobile, 'app/service-images.tsx'),
  read(mobile, 'app/service-provider-profile.tsx'),
  read(mobile, 'app/my-store.tsx'),
  read(mobile, 'app/profile.tsx'),
  read(mobile, 'app/store-promotions.tsx'),
  read(mobile, 'app/service-requests/[id].tsx'),
  read(mobile, 'src/lib/navigation-policy.ts'),
]);

const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };

check('API errors preserve machine code and field validation details', /public readonly code\?: string/.test(apiClient) && /body\.code/.test(apiClient) && /fieldErrors/.test(apiClient));
check('common server error codes receive Arabic user-facing messages', /VALIDATION_ERROR:\s*'تحقق/.test(apiClient) && /INTERNAL_ERROR:\s*'حدث خطأ/.test(apiClient));
check('idempotent GET cold-start/network retry is bounded', /_networkRetried/.test(apiClient) && /method\s*===?\s*['"]GET['"]/.test(apiClient) && /const DEFAULT_TIMEOUT_MS = 10_000/.test(apiClient) && /timeoutMs,\s*_networkRetried: true/.test(apiClient));
check('optional empty phone is omitted from both profile writes', /phone\.trim\(\)\s*\?\s*\{\s*phone:\s*phone\.trim\(\)\s*\}/.test(profile) && /phone\.trim\(\)\s*\?\s*\{\s*phone:\s*phone\.trim\(\)\s*\}/.test(completeProfile));
check('missing own store is normalized to null for missing-store codes', /error\.status === 404/.test(commerceApi) && /STORE_NOT_FOUND/.test(commerceApi) && /SELLER_NOT_FOUND/.test(commerceApi));
check('active store memberships are exposed through an authenticated API route', /get\(\s*['"]\/me\/memberships['"]/.test(storesRoutes) && /listMyActiveMemberships/.test(membersController) && /\/api\/v1\/stores\/me\/memberships/.test(membershipsApi));
check('membership list screen is reachable and navigates to the requested team store', /المتاجر التي أعمل بها/.test(myStores) && /params:\s*\{\s*storeId:\s*item\.store\.id\s*\}/.test(myStores) && /requestedStoreId/.test(storeTeam));
check('outbox permanently rejects eligible 4xx and skips failed FIFO rows', /status >= 400 && status < 500 && !\[401, 408, 425, 429\]/.test(outbox) && /state IN \('pending','processing'\)/.test(outbox));
check('multipart outbox upload timeout scales with validated image bytes', /totalImageBytes \+= info\.size/.test(outbox) && /Math\.ceil\(totalImageBytes \/ \(1024 \* 1024\)\)/.test(outbox) && /timeoutMs: requestBody\.timeoutMs/.test(outbox));
check('failed offline creates produce a foreground notification linking to the queue', /Alert\.alert\(/.test(outboxBridge) && /router\.push\('\/offline-queue'/.test(outboxBridge) && /state === 'failed'/.test(outboxBridge));
check('seller dashboard loads independently and exposes promotions and seller orders', /Promise\.allSettled/.test(sellerDashboard) && /router\.push\('\/store-promotions'\)/.test(sellerDashboard) && /router\.push\('\/seller-orders'\)/.test(sellerDashboard));
check('service types use typed controls and preserve other unsaved cards', !/JSON\.stringify\(attributes/.test(serviceTypes) && /setItems\(\(current\) => current\.map/.test(serviceTypes) && /error=\{fieldError\}/.test(serviceTypes));
check('completed service requests link to a prefilled review form', /initialRequestId/.test(serviceReviews) && /pathname:\s*['"]\/service-reviews['"]/.test(serviceRequestDetail) && /requestId/.test(serviceRequestDetail));
check('guest service-request submission asks the user to sign in', /سجّل الدخول لإرسال طلب الخدمة/.test(serviceRequestList) && /router\.push\('\/login'\)/.test(serviceRequestList));
check('incoming service requests are restricted to eligible providers', /canReceiveIncoming/.test(serviceRequestList) && /checkingProvider/.test(serviceRequestList));
check('customer-only appointment action is gated by customer id', /item\.customerId === user\?\.id/.test(serviceRequestList));
check('store invitations include an explicit decline action', /رفض دعوة المتجر/.test(storeInvites) && /removeStoreMember/.test(storeInvites));
check('store management shows status and avoids keyboard overlap on iOS', /KeyboardAvoidingView/.test(myStore) && /statusLabel\(store\.status\)/.test(myStore));
check('numeric inputs normalize Arabic and Persian digits before state updates', /normalizeNumericInput\(nextValue\)/.test(field) && /٠-٩/.test(normalize) && /۰-۹/.test(normalize));
check('Arabic drawer is anchored independently from native LTR layout and exposes mobile sections', /const isRTL = true/.test(drawer) && /forceRTL\(false\)/.test(layout) && /DRAWER_ITEMS/.test(drawer) && /path:\s*['"]\/my-stores['"]/.test(navigationPolicy) && /path:\s*['"]\/offline-queue['"]/.test(navigationPolicy));
check('public store statistics screen has an incoming navigation path', /pathname:\s*['"]\/store\/\[slug\]\/stats['"]/.test(storeDetail) && /إحصاءات المبيعات العامة/.test(storeDetail) && /public\/stores/.test(storeStats));
check('drawer and invoice visible brand label use سوق غزة', /سوق غزة/.test(drawer) && /سوق غزة/.test(await read(mobile, 'app/sales/[id].tsx')) && /سوق غزة/.test(await read(mobile, 'app/sales/[id]/receipt.tsx')));
check('followers and following lists use the shared cancellable pager with pull-to-refresh and retryable append failures', /usePaginatedList/.test(followers) && /fetchUserFollowList\(id, 'followers', requestedPage, PAGE_SIZE, signal\)/.test(followers) && /usePaginatedList/.test(following) && /fetchUserFollowList\(id, 'following', requestedPage, PAGE_SIZE, signal\)/.test(following) && /RefreshControl/.test(followers) && /RefreshControl/.test(following) && /list\.loadMore\(\)/.test(followers) && /list\.loadMore\(\)/.test(following));
check('my reports, requests and offers use the shared pager with cancellation and retryable page appends', /usePaginatedList/.test(myReports) && /fetchMyReports\(token, page, PAGE_SIZE, signal\)/.test(myReports) && /usePaginatedList/.test(myRequests) && /fetchMyRequests\(token, user\?\.id, page, PAGE_SIZE, signal\)/.test(myRequests) && /usePaginatedList/.test(myOffers) && /fetchMyOffers\(token, user\?\.id, page, PAGE_SIZE, signal\)/.test(myOffers) && /pageNum/.test(requestsApi) && /list\.loadMore\(\)/.test(myOffers) && /list\.loadMore\(\)/.test(myRequests));
check('report reasons have screen-reader radio semantics', /accessibilityRole="radio"/.test(reportForm) && /accessibilityState=\{\{ selected: reason === item\.value \}\}/.test(reportForm));
check('seller ranking screen is wrapped in a top Safe Area', /SafeAreaView/.test(sellersRanking) && /edges=\{\['top'\]\}/.test(sellersRanking));
check('service requests provide paginated retrieval and pull-to-refresh', /fetchServiceRequests\(accessToken, incoming, requestedPage, 30\)/.test(serviceRequestList) && /RefreshControl/.test(serviceRequestList) && /تحميل المزيد من الطلبات/.test(serviceRequestList) && /page=\$\{page\}/.test(serviceRequestsApi));
check('image uploads share one MIME/extension validator across profile, store, and services', /normalizePickedImage/.test(profileScreen) && /normalizePickedImage/.test(myStoreScreen) && /normalizePickedImage/.test(providerProfile) && /normalizePickedImage/.test(serviceImages) && /normalizedDeclared !== inferredMime/.test(imageHelper));
check('add entry warns when email verification is missing', /user\.emailVerified === false/.test(addScreen) && /verify-email/.test(addScreen));
check('promotion date presets are 7, 14, and 30 days', /days:7,label:'7 أيام'/.test(promotionsScreen) && /days:14,label:'14 يومًا'/.test(promotionsScreen) && /days:30,label:'30 يومًا'/.test(promotionsScreen));
check('appointment status uses the Arabic status-label dictionary', /statusLabel\(request\.appointment\.status\)/.test(serviceRequestDetailScreen));

console.log(`✅ Mobile audit repair regression checks passed: ${checks.length}/${checks.length}`);
for (const name of checks) console.log(`  • ${name}`);
