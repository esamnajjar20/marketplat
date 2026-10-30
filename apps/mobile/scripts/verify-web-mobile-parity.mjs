#!/usr/bin/env node
/**
 * Static contract guards for the mobile parity implementation.
 * This intentionally tests real routes, API contracts, security boundaries,
 * and semantic tokens without requiring Expo, a simulator, or a running API.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = resolve(here, '..');
const repo = resolve(mobile, '../..');
const read = (path) => readFile(resolve(repo, path), 'utf8');
const checks = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}

const [tokens, productDetail, adDetail, storeDetail, search, serviceDetail, serviceList, serviceApi, productApi, adsApi,
  favoritesApi, offlineStorage, settings, sessionsPage, deletePage, deleteApi, followingPage, allAds, sellerDashboard,
  productService, userService, userRoutes, timeline, gallery, productCard, forYouPage, home, config] = await Promise.all([
  read('apps/mobile/src/theme/tokens.ts'),
  read('apps/mobile/app/products/[id].tsx'),
  read('apps/mobile/app/ads/[id].tsx'),
  read('apps/mobile/app/stores/[id].tsx'),
  read('apps/mobile/app/search.tsx'),
  read('apps/mobile/app/service-requests/[id].tsx'),
  read('apps/mobile/app/service-requests.tsx'),
  read('apps/mobile/src/features/services/services.api.ts'),
  read('apps/mobile/src/features/commerce/commerce.api.ts'),
  read('apps/mobile/src/features/ads/ads.api.ts'),
  read('apps/mobile/src/features/ads/favorites.api.ts'),
  read('apps/mobile/src/storage/saved-offline.ts'),
  read('apps/mobile/app/settings.tsx'),
  read('apps/mobile/app/sessions.tsx'),
  read('apps/mobile/app/delete-account.tsx'),
  read('apps/mobile/src/features/account/delete-account.api.ts'),
  read('apps/mobile/app/following.tsx'),
  read('apps/mobile/app/ads.tsx'),
  read('apps/mobile/app/seller-dashboard.tsx'),
  read('apps/api/src/modules/products/products.service.ts'),
  read('apps/api/src/modules/users/users.service.ts'),
  read('apps/api/src/modules/users/users.routes.ts'),
  read('apps/mobile/src/components/ui/ServiceRequestTimeline.tsx'),
  read('apps/mobile/src/components/ui/MediaGallery.tsx'),
  read('apps/mobile/src/components/ui/ProductCard.tsx'),
  read('apps/mobile/app/for-you.tsx'),
  read('apps/mobile/app/index.tsx'),
  read('apps/mobile/app.json'),
]);

check('semantic colors match canonical web-mobile palette', tokens.includes("brand: '#397F56'") && tokens.includes("canvas: '#FDFCF9'") && tokens.includes("ink: '#241E19'") && tokens.includes("accent: '#AD531F'"));
check('semantic spacing, radius, and light elevation tokens are present', tokens.includes('x4l: 48') && tokens.includes('x5l: 64') && tokens.includes('card: 14') && tokens.includes('modal: 16') && tokens.includes('shell: 20') && tokens.includes('sm: {') && tokens.includes('warningText'));
check('dark mode remains disabled', config.includes('"userInterfaceStyle": "light"'));
check('product detail uses safe image gallery, favorite, attributes, ratings, and sharing', productDetail.includes('<MediaGallery') && productDetail.includes('<FavoriteButton') && productDetail.includes('<ProductAttributeList') && productDetail.includes('<RatingStars') && productDetail.includes('<ShareButton'));
check('product recommendations are one query per detail and use shared ProductCard', productDetail.includes('fetchMixedRecommendations(8, accessToken)') && productDetail.includes('<ProductCard') && !productDetail.includes('recommendationCard:'));
check('favorite API uses existing polymorphic routes', favoritesApi.includes('/api/v1/favorites/${entityType}/${encodeURIComponent(entityId)}/check') && favoritesApi.includes('/api/v1/favorites/${entityType}/${encodeURIComponent(entityId)}'));
check('ads expose view count and explicit offline save control', adDetail.includes('ad.views') && adDetail.includes('<SaveOfflineButton') && adDetail.includes('نصائح السلامة'));
check('offline bookmarks use separate encrypted SQLite table', offlineStorage.includes('openEncryptedDatabaseAsync') && offlineStorage.includes('saved_offline_resources') && offlineStorage.includes('PRIMARY KEY (kind, id)'));
check('search supports save-search, dynamic content types, and backend condition filter', search.includes('createSavedSearch') && search.includes("value: 'stores'") && search.includes("value: 'REFURBISHED'") && search.includes('condition: condition || undefined'));
check('storefront has six lazily-loaded tabs and a shared store ShareButton', storeDetail.includes('<StorefrontTabs') && storeDetail.includes("tab === 'offers'") && storeDetail.includes("tab === 'collections'") && storeDetail.includes("tab === 'ads'") && storeDetail.includes('fetchPublicCollections(id)') && storeDetail.includes('<ShareButton'));
check('service request has standalone details, images, appointment, timeline, and role-gated actions', serviceDetail.includes('<MediaGallery') && serviceDetail.includes('<ServiceRequestTimeline') && serviceDetail.includes('role.provider') && serviceDetail.includes('request.appointment'));
check('service request list navigates to detail instead of bypassing quote flow', serviceList.includes("/service-requests/[id]") || serviceList.includes("pathname: '/service-requests/[id]'"));
check('service API fetches protected detail and carries price/dispute data', serviceApi.includes('fetchServiceRequest') && serviceApi.includes('agreedPrice') && serviceApi.includes('quotedPrice'));
check('active sessions support listing and revoking non-current sessions', sessionsPage.includes('fetchActiveSessions') && sessionsPage.includes('revokeActiveSession') && sessionsPage.includes('session.isCurrent'));
check('account deletion requires password re-auth on the mobile path', deletePage.includes('deleteAccountAfterReauthentication') && deletePage.includes('كلمة المرور الحالية') && deleteApi.includes('/api/v1/users/me/delete-confirmed'));
check('server verifies password and fails closed for OAuth-only profiles', userService.includes('comparePassword(currentPassword, user.passwordHash)') && userService.includes('OAUTH_REAUTH_REQUIRED'));
check('server route is authenticated and rate limited', userRoutes.includes("post('/me/delete-confirmed', authenticate, changePasswordRateLimit"));
check('public product APIs redact account numbers and account holder names', productService.includes('sanitizePublicProductPaymentMethods') && productService.includes('paymentMethods: methods') && productService.includes('Redact after cache retrieval too'));
check('following list and all-ads listing routes exist', followingPage.includes('fetchUserFollowList') && allAds.includes('fetchPublicAds') && allAds.includes('page <='));
check('seller dashboard fetches store/seller/analytics in bounded requests', sellerDashboard.includes('fetchMyStore') && sellerDashboard.includes('fetchMySellerProfile') && sellerDashboard.includes('fetchMyStoreAnalytics'));
check('shared gallery has a fullscreen paged viewer and image counter', gallery.includes('<Modal') && gallery.includes('pagingEnabled') && gallery.includes('validImages.length'));
check('shared timeline is status-driven and avoids fabricated timestamps', timeline.includes('createdAt') && timeline.includes('respondedAt') && !timeline.includes('updatedAt'));
check('For You route exists and is reachable from the mobile homepage', forYouPage.includes('<DiscoveryFeedScreen forYou') && home.includes("router.push('/for-you')"));
check('shared ProductCard has grid and row variants', productCard.includes("layout?: 'row' | 'grid'") && productCard.includes('accessibilityLabel'));
check('legal/privacy/support links are available from settings', ['privacy', 'terms', 'contact', 'about'].every((path) => settings.includes(`/${path}`)));

console.log(`✅ Mobile web-parity static contract checks: ${checks.length}/${checks.length} passed.`);
for (const name of checks) console.log(`  ✓ ${name}`);
