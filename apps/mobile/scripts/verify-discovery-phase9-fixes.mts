#!/usr/bin/env node
// @ts-nocheck
/** Static regression checks for the Phase 9 discovery/favorites fixes. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repo = resolve(process.cwd(), '../..');
const read = (path: string) => readFile(resolve(repo, path), 'utf8');
const [search, saved, favorites, favoriteApi, favoriteButton, storeDetail, serviceDetail,
  favoriteService, favoriteController, favoriteRoutes, favoriteServiceTests,
  favoriteControllerTests, datePicker, notificationDevices] = await Promise.all([
  read('apps/mobile/app/search.tsx'),
  read('apps/mobile/app/saved-searches.tsx'),
  read('apps/mobile/app/favorites.tsx'),
  read('apps/mobile/src/features/ads/favorites.api.ts'),
  read('apps/mobile/src/components/ui/FavoriteButton.tsx'),
  read('apps/mobile/app/stores/[id].tsx'),
  read('apps/mobile/app/services/[id].tsx'),
  read('apps/api/src/modules/engagement/favorites/favorites.service.ts'),
  read('apps/api/src/modules/engagement/favorites/favorites.controller.ts'),
  read('apps/api/src/modules/engagement/favorites/favorites.routes.ts'),
  read('apps/api/tests/unit/favorites.service.test.ts'),
  read('apps/api/tests/unit/favorites.controller.test.ts'),
  read('apps/mobile/src/components/ui/DatePickerField.tsx'),
  read('apps/mobile/src/features/notifications/NotificationDevicesSection.tsx'),
]);

const checks: string[] = [];
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  checks.push(name);
}

check('Search imports dedicated category providers for ads, products, and services',
  search.includes('fetchPublicCategories') && search.includes('fetchProductCategories') && search.includes('fetchServiceCategoryOptions'));
check('Category source follows the active content type and ignores stale requests',
  /type === 'ads'[\s\S]*?fetchPublicCategories[\s\S]*?type === 'products'[\s\S]*?fetchProductCategories[\s\S]*?fetchServiceCategoryOptions/.test(search) && search.includes('if (!active) return;'));
check('Category fetch failures are visible and retryable',
  search.includes('categoriesError') && search.includes('setCategoryRetry((value) => value + 1)') && search.includes('إعادة تحميل التصنيفات'));
check('Changing search type clears category IDs and incompatible condition filters',
  /setType\(entry\.value\);\s*setCategoryId\(''\);\s*if \(entry\.value !== 'ads'\) setCondition\(''\);/.test(search));
check('Search save route carries city and condition only for ads',
  search.includes("city: type === 'ads' ? city : ''") && search.includes("condition: type === 'ads' ? condition : ''"));
check('Saved-search creation persists condition and ad-only city',
  saved.includes("...(type === 'ads' && city.trim() ? { city: city.trim() } : {})") && saved.includes("...(type === 'ads' && condition ? { condition } : {})"));
check('Saved-search cards summarize query, city, category, condition, and price bounds',
  saved.includes('savedSearchFilterLabels') && saved.includes('filters.q') && saved.includes('filters.city') && saved.includes('filters.categoryId') && saved.includes('filters.condition') && saved.includes('filters.minPrice') && saved.includes('filters.maxPrice') && saved.includes('categoryLabels[filters.categoryId]'));
check('Saved-search navigation restores the saved condition and ad-only city',
  saved.includes("condition: (i.filters.type || 'ads') === 'ads' ? i.filters.condition || '' : ''") && saved.includes("city: (i.filters.type || 'ads') === 'ads' ? i.filters.city || '' : ''"));
check('Favorites screen provides ads, products, stores, and services tabs',
  ["value: 'ads'", "value: 'products'", "value: 'stores'", "value: 'services'"].every((value) => favorites.includes(value)));
check('Favorites fetch is paginated per type rather than preloading all ad pages',
  favorites.includes('fetchFavoriteAdsPage(token, 1, 20)') && favorites.includes('fetchFavoriteEntityPage') && !favorites.includes('fetchFavoriteAds(token)'));
check('Favorites list loads subsequent pages on scroll and has explicit load-more fallback',
  favorites.includes('onEndReached={() => { if (totalPages > page) void loadMore(); }}') && favorites.includes('تحميل المزيد'));
check('Favorite buttons check current state and distinguish unknown/loading/error states',
  favoriteButton.includes('checkFavoriteEntity') && favoriteButton.includes("type CheckStatus = 'loading' | 'ready' | 'error'") && favoriteButton.includes("setCheckStatus('error')") && favoriteButton.includes('إعادة التحقق'));
check('Favorite button writes an explicit desired state instead of toggling blindly',
  favoriteButton.includes('setFavoriteEntityState') && !favoriteButton.includes('toggleFavoriteEntity(') && favoriteApi.includes('/${entityType}/${encodeURIComponent(entityId)}/state'));
check('Store and service detail pages expose favorite actions',
  storeDetail.includes('<FavoriteButton entityType="stores"') && serviceDetail.includes('<FavoriteButton entityType="services"'));
check('Server exposes authenticated idempotent state route for polymorphic favorites',
  favoriteRoutes.includes("'/:entityType/:entityId/state'") && favoriteRoutes.includes('favoritesController.setFavoriteEntityState') && favoriteController.includes('typeof favorited !== \'boolean\'') && favoriteService.includes('setFavoriteEntityState'));
check('Server desired-state operation treats duplicate creates/deletes as no-op retries',
  favoriteService.includes("isPrismaError(error, 'P2002')") && favoriteService.includes("isPrismaError(error, 'P2025')"));
check('Focused service and controller regression tests cover idempotency and body validation',
  favoriteServiceTests.includes('describe(\'setFavoriteEntityState\'') && favoriteControllerTests.includes('rejects a non-boolean desired favorite state'));
check('Date picker backdrop uses the theme modal backdrop token',
  datePicker.includes('colors.modalBackdrop') && !datePicker.includes('rgba(0,0,0,0.45)'));
check('Notification device separators use the semantic subtle-border token',
  notificationDevices.includes('colors.borderSubtle') && !notificationDevices.includes('#00000018'));

console.log(`✅ Phase 9 discovery/favorites static checks: ${checks.length}/${checks.length} passed.`);
for (const name of checks) console.log(`  ✓ ${name}`);
