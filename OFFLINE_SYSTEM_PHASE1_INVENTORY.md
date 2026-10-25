# Offline System — Phase 1 Inventory and Audit

Generated: 2026-10-18T16:24:56.309Z

## Scope and method

Static import inventory of apps/web/shared/backend runtime source files. Scanned 1379 source files and identified 121 offline/cache/network/queue/warming-related modules. Import counts are static approximations: runtime registration, framework route entrypoints, worker entrypoints, dynamic imports, and string-based loading may not appear as ordinary imports. No source modules are deleted or rewritten by this script.

## Inventory by responsibility

### Connectivity and lifecycle (7)

-  apps/web/lib/isNetworkLikeFailure.ts — 11 static importers; used by apps/web/components/ads/AdForm.tsx, apps/web/components/services/ServiceListingForm.tsx, apps/web/components/shared/forms/PublishMutationErrorNotice.tsx, apps/web/components/stores/ProductForm.tsx, and 7 more
-  apps/web/lib/networkErrors.ts — 2 static importers; used by apps/web/api/client.ts, apps/web/api/media.api.ts
-  apps/web/lib/networkLifecycle.ts — 10 static importers; used by apps/web/components/offline/OfflineHub.tsx, apps/web/components/pwa/OfflineBootstrap.tsx, apps/web/components/shared/PresenceHeartbeat.tsx, apps/web/hooks/queries/usePendingMessages.ts, and 6 more
-  apps/web/lib/networkObservability.ts — 4 static importers; used by apps/web/api/client.ts, apps/web/api/media.api.ts, apps/web/components/pwa/OfflineBootstrap.tsx, apps/web/lib/connectionQuality.ts
-  apps/web/lib/networkPolicy.ts — 25 static importers; used by apps/web/api/client.ts, apps/web/api/media.api.ts, apps/web/components/ads/SearchResults.tsx, apps/web/components/promoted/PromotedPageClient.tsx, and 21 more
-  apps/web/lib/networkRequestMonitor.ts — 4 static importers; used by apps/web/components/admin/AdminConsolePanel.tsx, apps/web/components/admin/AdminMonitoringCenter.tsx, apps/web/components/admin/AdminNetworkRequestsPanel.tsx, apps/web/components/debug/DeviceErrorCapture.tsx
-  apps/web/lib/offlineError.ts — 2 static importers; used by apps/web/lib/offline/index.ts, apps/web/lib/sales-offline/salesSync.ts

### Data cache and freshness (42)

-  apps/api/src/middlewares/cacheControl.middleware.ts — 28 static importers; used by apps/api/src/modules/activity/activity.routes.ts, apps/api/src/modules/admin/admin.routes.ts, apps/api/src/modules/ads/ads.routes.ts, apps/api/src/modules/appointments/appointments.routes.ts, and 24 more
-  apps/api/src/modules/ads/ads.cache.keys.ts — 7 static importers; used by apps/api/src/modules/ads/ads-pin.service.ts, apps/api/src/modules/ads/ads.service.ts, apps/api/src/modules/categories/categories.service.ts, apps/api/src/modules/fraud/fraud.service.ts, and 3 more
-  apps/api/src/modules/home/home-feed.cache.ts — 1 static importer; used by apps/api/src/modules/home/home-feed.controller.ts
-  apps/api/src/modules/home/home.cache.keys.ts — 6 static importers; used by apps/api/src/modules/ads/ads.cache.keys.ts, apps/api/src/modules/home/home-feed.cache.ts, apps/api/src/modules/home/home.cache.ts, apps/api/src/modules/product-categories/product-categories.service.ts, and 2 more
-  apps/api/src/modules/home/home.cache.ts — 2 static importers; used by apps/api/src/modules/home/home.controller.ts, apps/api/src/shared/utils/cacheWarmup.ts
-  apps/api/src/modules/recommendations/recommendations.cache.ts — 2 static importers; used by apps/api/src/modules/home/home-feed.cache.ts, apps/api/src/modules/recommendations/recommendations.controller.ts
-  apps/api/src/shared/cache/cacheContract.ts — 3 static importers; used by apps/api/src/modules/service-types/service-types.service.ts, apps/api/src/shared/cache/cacheInvalidationRegistry.ts, apps/api/src/shared/utils/publicListCache.ts
-  apps/api/src/shared/cache/cacheInvalidationRegistry.ts — 0 static importers
-  apps/api/src/shared/cache/cacheKey.ts — 3 static importers; used by apps/api/src/modules/service-types/service-types.service.ts, apps/api/src/shared/cache/warmedListQueries.ts, apps/api/src/shared/utils/publicListCache.ts
-  apps/api/src/shared/cache/cachePolicy.ts — 4 static importers; used by apps/api/src/middlewares/cacheControl.middleware.ts, apps/api/src/modules/ads/ads.service.ts, apps/api/src/modules/home/home.cache.ts, apps/api/src/shared/utils/publicListCache.ts
-  apps/api/src/shared/cache/cacheRegistry.ts — 0 static importers
-  apps/api/src/shared/utils/adminStatsCache.ts — 1 static importer; used by apps/api/src/modules/admin/admin.service.ts
-  apps/api/src/shared/utils/cacheGuard.ts — 2 static importers; used by apps/api/src/shared/utils/cacheWarmup.ts, apps/api/src/shared/utils/swrCache.ts
-  apps/api/src/shared/utils/cacheMetrics.ts — 2 static importers; used by apps/api/src/shared/utils/cacheWarmup.ts, apps/api/src/shared/utils/swrCache.ts
-  apps/api/src/shared/utils/healthCache.ts — 1 static importer; used by apps/api/src/app.ts
-  apps/api/src/shared/utils/publicListCache.ts — 10 static importers; used by apps/api/src/modules/admin/admin.service.ts, apps/api/src/modules/product-categories/product-categories.service.ts, apps/api/src/modules/products/products.service.ts, apps/api/src/modules/sellers/sellers.service.ts, and 6 more
-  apps/api/src/shared/utils/swrCache.ts — 9 static importers; used by apps/api/src/modules/ads/ads.cache.keys.ts, apps/api/src/modules/ads/ads.service.ts, apps/api/src/modules/home/home-feed.cache.ts, apps/api/src/modules/home/home.cache.keys.ts, and 5 more
-  apps/api/src/shared/utils/unreadNotificationsCache.ts — 3 static importers; used by apps/api/src/modules/notifications/notifications.repository.ts, apps/api/src/server.ts, apps/api/src/shared/outbox/outbox.worker.ts
-  apps/api/src/shared/utils/userCache.ts — 6 static importers; used by apps/api/src/middlewares/auth.middleware.ts, apps/api/src/middlewares/requireVerifiedEmail.middleware.ts, apps/api/src/modules/admin/admin.service.ts, apps/api/src/modules/auth/auth.service.ts, and 2 more
-  apps/web/lib/cache/cacheContract.ts — 1 static importer; used by apps/web/lib/cache/queryCacheInvalidation.ts
-  apps/web/lib/cache/cacheInvalidationRegistry.ts — 2 static importers; used by apps/web/lib/cache/queryCacheInvalidation.ts, apps/web/lib/offlineCacheInvalidation.ts
-  apps/web/lib/cache/cacheKey.ts — 1 static importer; used by apps/web/lib/offlineCacheInvalidation.ts
-  apps/web/lib/cache/cacheRegistry.ts — 0 static importers
-  apps/web/lib/cache/queryCacheInvalidation.ts — 1 static importer; used by apps/web/api/client.ts
-  apps/web/lib/cachePolicy.ts — 3 static importers; used by apps/web/lib/offlineCachePolicy.ts, apps/web/lib/offlineFreshness.ts, apps/web/lib/queryClient.ts
-  apps/web/lib/cacheVersion.ts — 3 static importers; used by apps/web/lib/offlineCoreBundle.ts, apps/web/lib/offlineRouteShells.ts, apps/web/lib/offlineWarmingUserData.ts
-  apps/web/lib/networkCachePolicy.ts — 3 static importers; used by apps/web/hooks/queries/useAds.ts, apps/web/hooks/queries/useProducts.ts, apps/web/hooks/queries/useServiceListings.ts
-  apps/web/lib/notificationsCache.ts — 4 static importers; used by apps/web/hooks/mutations/useAuthMutations.ts, apps/web/hooks/queries/useNotifications.ts, apps/web/lib/authCleanup.ts, apps/web/lib/offlineCacheInvalidation.ts
-  apps/web/lib/offlineCacheEnvelope.ts — 2 static importers; used by apps/web/lib/offlineJsonCache.ts, apps/web/lib/offlineListCache.ts
-  apps/web/lib/offlineCacheInvalidation.ts — 1 static importer; used by apps/web/components/pwa/OfflineBootstrap.tsx
-  apps/web/lib/offlineCachePolicy.ts — 6 static importers; used by apps/web/hooks/queries/useAppointments.ts, apps/web/hooks/queries/useServiceListings.ts, apps/web/hooks/queries/useStores.ts, apps/web/lib/offline/index.ts, and 2 more
-  apps/web/lib/offlineFreshness.ts — 5 static importers; used by apps/web/components/offline/OfflineFreshnessBadge.tsx, apps/web/components/shared/NetworkStatusBanner.tsx, apps/web/lib/offline/index.ts, apps/web/lib/offlineCacheEnvelope.ts, and 1 more
-  apps/web/lib/offlineJsonCache.ts — 10 static importers; used by apps/web/hooks/queries/useAppointments.ts, apps/web/hooks/queries/useAuth.ts, apps/web/hooks/queries/useSellers.ts, apps/web/hooks/queries/useServiceProviders.ts, and 6 more
-  apps/web/lib/offlineListCache.ts — 16 static importers; used by apps/web/components/sellers/SellersRankingList.tsx, apps/web/hooks/queries/useActivity.ts, apps/web/hooks/queries/useAds.ts, apps/web/hooks/queries/useCategories.ts, and 12 more
-  apps/web/lib/offlineQueryCache.ts — 3 static importers; used by apps/web/components/shared/NetworkStatusBanner.tsx, apps/web/lib/authCleanup.ts, apps/web/providers/AppProviders.tsx
-  apps/web/lib/offlineSavedEntities.ts — 2 static importers; used by apps/web/components/ads/SavedOfflineAdsPageClient.tsx, apps/web/components/shared/SaveOfflineButton.tsx
-  apps/web/lib/offlineSearchIndex.ts — 2 static importers; used by apps/web/components/search/SearchResults.tsx, apps/web/hooks/queries/useSearch.ts
-  apps/web/public/cache-contract.js — 0 static importers
-  apps/web/public/cache-policy.js — 0 static importers
-  shared/cache/cacheKey.ts — 0 static importers
-  workers/cf-api-proxy/cache-policy.test.mjs — 0 static importers
-  workers/cf-api-proxy/cache-probe.mjs — 0 static importers

### Mutations, drafts, queues and sync (13)

-  apps/api/src/middlewares/offlineOperationId.middleware.ts — 1 static importer; used by apps/api/src/app.ts
-  apps/api/src/shared/queue/notificationQueue.ts — 4 static importers; used by apps/api/src/server.ts, apps/api/src/shared/queue/notificationProcessors.ts, apps/api/src/shared/utils/emailFallbackScheduler.ts, apps/api/src/shared/utils/pushService.ts
-  apps/web/lib/offlineAdDraftSync.ts — 1 static importer; used by apps/web/components/pwa/OfflineBootstrap.tsx
-  apps/web/lib/offlineAdDrafts.ts — 18 static importers; used by apps/web/components/ads/AdForm.tsx, apps/web/components/offline/PendingOfflinePublishCard.tsx, apps/web/components/requests/CreateRequestForm.tsx, apps/web/components/services/ServiceListingForm.tsx, and 14 more
-  apps/web/lib/offlineAppointmentDrafts.ts — 2 static importers; used by apps/web/components/settings/SyncCenterClient.tsx, apps/web/hooks/mutations/useAppointmentMutations.ts
-  apps/web/lib/offlineDraftPublisher.ts — 3 static importers; used by apps/web/components/pwa/OfflineBootstrap.tsx, apps/web/components/settings/DraftsCenterClient.tsx, apps/web/components/settings/SyncCenterClient.tsx
-  apps/web/lib/offlineDraftResume.ts — 11 static importers; used by apps/web/components/ads/AdForm.tsx, apps/web/components/offline/PendingOfflinePublishCard.tsx, apps/web/components/requests/CreateRequestForm.tsx, apps/web/components/services/ServiceListingForm.tsx, and 7 more
-  apps/web/lib/offlineMessagesQueue.ts — 4 static importers; used by apps/web/components/messages/ChatWindow.tsx, apps/web/components/messages/MessageMediaGallery.tsx, apps/web/hooks/queries/usePendingMessages.ts, apps/web/lib/offline/index.ts
-  apps/web/lib/offlineOperationId.ts — 14 static importers; used by apps/web/api/ads.api.ts, apps/web/api/client.ts, apps/web/api/conversations.api.ts, apps/web/api/products.api.ts, and 10 more
-  apps/web/lib/offlineQueue.ts — 10 static importers; used by apps/web/api/client.ts, apps/web/components/offline/OfflineHub.tsx, apps/web/components/pwa/OfflineBootstrap.tsx, apps/web/components/settings/SyncCenterClient.tsx, and 6 more
-  apps/web/lib/sales-offline/salesSync.ts — 3 static importers; used by apps/web/components/pwa/OfflineBootstrap.tsx, apps/web/components/settings/SyncCenterClient.tsx, apps/web/hooks/mutations/useSaleMutations.ts
-  apps/web/lib/serialMutationQueue.ts — 2 static importers; used by apps/web/hooks/mutations/useFavoriteMutations.ts, apps/web/hooks/mutations/useFollowMutations.ts
-  apps/web/lib/swTokenSync.ts — 1 static importer; used by apps/web/components/pwa/OfflineBootstrap.tsx

### Other offline-related (18)

-  apps/web/app/offline/page.tsx — 0 static importers
-  apps/web/lib/imageOffline.ts — 2 static importers; used by apps/web/components/shared/forms/ImageUpload.tsx, apps/web/lib/imageOfflineHelpers.ts
-  apps/web/lib/imageOfflineHelpers.ts — 4 static importers; used by apps/web/hooks/mutations/useAdMutations.ts, apps/web/hooks/mutations/useProductMutations.ts, apps/web/hooks/mutations/useRequestMutations.ts, apps/web/hooks/mutations/useServiceListingMutations.ts
-  apps/web/lib/offline/index.ts — 0 static importers
-  apps/web/lib/offlineActivityLog.ts — 3 static importers; used by apps/web/components/offline/OfflineHub.tsx, apps/web/components/pwa/OfflineBootstrap.tsx, apps/web/lib/authCleanup.ts
-  apps/web/lib/offlineAutoRead.ts — 3 static importers; used by apps/web/components/ads/AdDetail.tsx, apps/web/components/search/EmptySearchSuggestions.tsx, apps/web/lib/authCleanup.ts
-  apps/web/lib/offlineCoreBundle.ts — 2 static importers; used by apps/web/app/(admin)/admin/debug/warming/page.tsx, apps/web/lib/offlineSearchIndex.ts
-  apps/web/lib/offlineFavoriteIntents.ts — 4 static importers; used by apps/web/components/pwa/OfflineBootstrap.tsx, apps/web/components/settings/SyncCenterClient.tsx, apps/web/hooks/mutations/useFavoriteMutations.ts, apps/web/hooks/queries/useFavorites.ts
-  apps/web/lib/offlineHubPrefs.ts — 2 static importers; used by apps/web/components/offline/OfflineHub.tsx, apps/web/components/pwa/OfflineBootstrap.tsx
-  apps/web/lib/offlineHubTabs.ts — 2 static importers; used by apps/web/app/offline/page.tsx, apps/web/components/offline/OfflineHub.tsx
-  apps/web/lib/offlineMessagesStore.ts — 2 static importers; used by apps/web/hooks/queries/useConversations.ts, apps/web/lib/authCleanup.ts
-  apps/web/lib/offlineMutationPolicy.ts — 1 static importer; used by apps/web/lib/offlineQueue.ts
-  apps/web/lib/offlinePublishFeedback.ts — 6 static importers; used by apps/web/components/pwa/OfflineBootstrap.tsx, apps/web/components/settings/SyncCenterClient.tsx, apps/web/hooks/mutations/useAdMutations.ts, apps/web/hooks/mutations/useProductMutations.ts, and 2 more
-  apps/web/lib/offlineRouteShells.ts — 6 static importers; used by apps/web/app/(admin)/admin/debug/warming/page.tsx, apps/web/components/settings/OfflineControlClient.tsx, apps/web/components/settings/OfflineRoutesList.tsx, apps/web/lib/offlineWarmingDebug.ts, and 2 more
-  apps/web/lib/offlineSelfWarm.ts — 3 static importers; used by apps/web/hooks/mutations/useAuthMutations.ts, apps/web/lib/offlineWarmingUserData.ts, apps/web/providers/AuthHydrationProvider.tsx
-  apps/web/lib/offlineStoragePressure.ts — 3 static importers; used by apps/web/lib/offlineWarmingPipeline.ts, apps/web/lib/storageStats.ts, apps/web/lib/warmingEngine.ts
-  apps/web/lib/offlineUserScope.ts — 12 static importers; used by apps/web/hooks/useFormDraft.ts, apps/web/hooks/useFormDraftAttachments.ts, apps/web/lib/lastKnownLocation.ts, apps/web/lib/offlineActivityLog.ts, and 8 more
-  apps/web/lib/useOfflineListSeed.ts — 8 static importers; used by apps/web/components/sellers/SellersRankingList.tsx, apps/web/hooks/queries/useAds.ts, apps/web/hooks/queries/useCategories.ts, apps/web/hooks/queries/useProductCategories.ts, and 4 more

### Shared contracts and Service Worker (2)

-  apps/api/src/shared/cache/warmedListQueries.ts — 3 static importers; used by apps/api/src/modules/ads/ads.service.ts, apps/api/src/shared/utils/cacheWarmup.ts, apps/api/src/shared/utils/publicListCache.ts
-  apps/web/public/sw.js — 0 static importers

### UI and hooks (18)

-  apps/web/components/admin/AdminNetworkRequestsPanel.tsx — 1 static importer; used by apps/web/components/admin/AdminMonitoringCenter.tsx
-  apps/web/components/admin/AdminOpsQueue.tsx — 1 static importer; used by apps/web/components/admin/AdminTabsHub.tsx
-  apps/web/components/ads/SavedOfflineAdsPageClient.tsx — 1 static importer; used by apps/web/components/offline/OfflineHub.tsx
-  apps/web/components/messages/MessageQueuedActions.tsx — 1 static importer; used by apps/web/components/messages/ChatMessageRow.tsx
-  apps/web/components/offline/OfflineFreshnessBadge.tsx — 2 static importers; used by apps/web/components/settings/OfflineControlClient.tsx, apps/web/components/settings/SyncCenterClient.tsx
-  apps/web/components/offline/OfflineHub.tsx — 1 static importer; used by apps/web/app/offline/page.tsx
-  apps/web/components/offline/PendingOfflinePublishCard.tsx — 3 static importers; used by apps/web/components/profile/MyAdsList.tsx, apps/web/components/services/MyServiceListingsList.tsx, apps/web/components/stores/MyProductsList.tsx
-  apps/web/components/pwa/OfflineBootstrap.tsx — 1 static importer; used by apps/web/providers/AppProviders.tsx
-  apps/web/components/pwa/WarmupIndicator.tsx — 1 static importer; used by apps/web/components/pwa/OfflineBootstrap.tsx
-  apps/web/components/settings/OfflineControlClient.tsx — 1 static importer; used by apps/web/components/offline/OfflineHub.tsx
-  apps/web/components/settings/OfflineRoutesList.tsx — 1 static importer; used by apps/web/components/settings/OfflineControlClient.tsx
-  apps/web/components/settings/SyncCenterClient.tsx — 1 static importer; used by apps/web/components/offline/OfflineHub.tsx
-  apps/web/components/shared/NetworkStatusBanner.tsx — 2 static importers; used by apps/web/components/admin/AdminMonitoringCenter.tsx, apps/web/providers/AppProviders.tsx
-  apps/web/components/shared/OfflineActionGate.tsx — 0 static importers
-  apps/web/components/shared/SaveOfflineButton.tsx — 4 static importers; used by apps/web/components/ads/AdDetail.tsx, apps/web/components/services/ServiceListingDetail.tsx, apps/web/components/stores/ProductDetail.tsx, apps/web/components/stores/StoreHeader.tsx
-  apps/web/components/shared/feedback/OfflineQueryFallback.tsx — 6 static importers; used by apps/web/components/ads/SearchResults.tsx, apps/web/components/requests/RequestsPageClient.tsx, apps/web/components/search/SearchResults.tsx, apps/web/components/services/ServiceListingsGrid.tsx, and 2 more
-  apps/web/hooks/useNetworkPolicy.ts — 6 static importers; used by apps/web/components/ads/SearchResults.tsx, apps/web/components/promoted/PromotedPageClient.tsx, apps/web/components/search/SearchResults.tsx, apps/web/components/services/ServiceListingsGrid.tsx, and 2 more
-  apps/web/hooks/useQueuedRequestCount.ts — 4 static importers; used by apps/web/api/client.ts, apps/web/components/layout/BottomNav.tsx, apps/web/components/offline/OfflineHub.tsx, apps/web/hooks/queries/usePendingMessages.ts

### Warming and route preparation (21)

-  apps/api/src/shared/utils/cacheWarmup.ts — 1 static importer; used by apps/api/src/server.ts
-  apps/web/lib/offlineWarmingAbort.ts — 2 static importers; used by apps/web/lib/offlineRouteShells.ts, apps/web/lib/offlineWarmingUserData.ts
-  apps/web/lib/offlineWarmingCoordinator.ts — 4 static importers; used by apps/web/lib/offlineCoreBundle.ts, apps/web/lib/offlineRouteShells.ts, apps/web/lib/offlineWarmingDebug.ts, apps/web/lib/offlineWarmingUserData.ts
-  apps/web/lib/offlineWarmingDebug.ts — 1 static importer; used by apps/web/app/(admin)/admin/debug/warming/page.tsx
-  apps/web/lib/offlineWarmingPipeline.ts — 3 static importers; used by apps/web/components/pwa/OfflineBootstrap.tsx, apps/web/components/settings/OfflineControlClient.tsx, apps/web/lib/offlineWarmingScheduler.ts
-  apps/web/lib/offlineWarmingPlanner.ts — 6 static importers; used by apps/web/lib/offlineCoreBundle.ts, apps/web/lib/offlineRouteShells.ts, apps/web/lib/offlineWarmingDebug.ts, apps/web/lib/offlineWarmingScheduler.ts, and 2 more
-  apps/web/lib/offlineWarmingReport.ts — 2 static importers; used by apps/web/lib/offlineCoreBundle.ts, apps/web/lib/offlineRouteShells.ts
-  apps/web/lib/offlineWarmingScheduler.ts — 1 static importer; used by apps/web/components/pwa/OfflineBootstrap.tsx
-  apps/web/lib/offlineWarmingState.ts — 6 static importers; used by apps/web/app/(admin)/admin/debug/warming/page.tsx, apps/web/components/settings/OfflineControlClient.tsx, apps/web/components/settings/OfflineRoutesList.tsx, apps/web/lib/authCleanup.ts, and 2 more
-  apps/web/lib/offlineWarmingUserData.ts — 0 static importers
-  apps/web/lib/warmingBroadcast.ts — 1 static importer; used by apps/web/lib/warmingProgress.ts
-  apps/web/lib/warmingBudget.ts — 4 static importers; used by apps/web/lib/offlineCoreBundle.ts, apps/web/lib/offlineWarmingPlanner.ts, apps/web/lib/warmingEngine.ts, apps/web/lib/warmingRuntimeBudget.ts
-  apps/web/lib/warmingEngine.ts — 1 static importer; used by apps/web/lib/offlineWarmingPipeline.ts
-  apps/web/lib/warmingManifest.ts — 1 static importer; used by apps/web/lib/offlineRouteShells.ts
-  apps/web/lib/warmingPreferences.ts — 6 static importers; used by apps/web/components/settings/OfflineControlClient.tsx, apps/web/lib/offlineCoreBundle.ts, apps/web/lib/offlineRouteShells.ts, apps/web/lib/offlineSelfWarm.ts, and 2 more
-  apps/web/lib/warmingPriorityQueue.ts — 1 static importer; used by apps/web/lib/warmingEngine.ts
-  apps/web/lib/warmingProgress.ts — 6 static importers; used by apps/web/components/pwa/WarmupIndicator.tsx, apps/web/components/settings/OfflineControlClient.tsx, apps/web/lib/offlineCoreBundle.ts, apps/web/lib/offlineRouteShells.ts, and 2 more
-  apps/web/lib/warmingQueryContract.ts — 2 static importers; used by apps/web/lib/offlineCoreBundle.ts, apps/web/lib/offlineWarmingUserData.ts
-  apps/web/lib/warmingRegistry.ts — 2 static importers; used by apps/web/lib/warmingEngine.ts, apps/web/lib/warmingPriorityQueue.ts
-  apps/web/lib/warmingRuntimeBudget.ts — 4 static importers; used by apps/web/lib/offlineCoreBundle.ts, apps/web/lib/offlineRouteShells.ts, apps/web/lib/offlineWarmingUserData.ts, apps/web/lib/warmingEngine.ts
-  apps/web/lib/warmingTelemetry.ts — 5 static importers; used by apps/web/hooks/useNavigationUsage.ts, apps/web/lib/offlineCoreBundle.ts, apps/web/lib/offlineRouteShells.ts, apps/web/lib/offlineWarmingUserData.ts, and 1 more

## Findings requiring action

- No known Phase 1 guardrail mismatch detected by the current checks.

## Zero-static-import candidates (review only; do not auto-delete)

- apps/api/src/shared/cache/cacheInvalidationRegistry.ts — zero static importers in the scanned source set. Check framework entrypoints, tests, side effects, and dynamic usage before deciding whether it is dead code.
- apps/api/src/shared/cache/cacheRegistry.ts — zero static importers in the scanned source set. Check framework entrypoints, tests, side effects, and dynamic usage before deciding whether it is dead code.
- apps/web/components/shared/OfflineActionGate.tsx — zero static importers in the scanned source set. Check framework entrypoints, tests, side effects, and dynamic usage before deciding whether it is dead code.
- apps/web/lib/cache/cacheRegistry.ts — zero static importers in the scanned source set. Check framework entrypoints, tests, side effects, and dynamic usage before deciding whether it is dead code.
- apps/web/lib/offlineWarmingUserData.ts — zero static importers in the scanned source set. Check framework entrypoints, tests, side effects, and dynamic usage before deciding whether it is dead code.

## Phase 2 updates

- Replaced broad contract-prefix persistence with a shape-aware allowlist for known public query-key forms. Private/admin siblings, user-owned resources, stock data, search text, coordinates, and the identity-bearing personalized home-feed branch are excluded.
- Restore checks key identity, timestamp bounds, actual stable-serialized UTF-8 byte size, and the recorded byte count. Ordinary query entries are capped at 512 KiB; the unified homepage feed has a dedicated 2 MiB cap.
- Preserved the 500-entry, 20 MiB aggregate, and seven-day limits. Regression coverage includes private/admin sibling keys, contextual params, payload size limits, corrupted byte counts, and invalid timestamps.
- Static phase 2 guardrail and dependency-free phase 1 guardrail pass. Vitest, full TypeScript validation, production build, and real-browser offline tests still require installed project dependencies and a browser run.
- Phase 3 public-page coverage: added exact-shape persistence for public seller profiles, seller ranking keys, PII-safe public user profile projections, public user-ad lists without search/location context, and public store aggregate stats. Personalized recommendations remain deliberately excluded because the API can personalize based on the bearer token even if a caller labels a query key as guest. Regression tests cover these allow/deny cases.

## Phase 1 decisions

1. Do not merge or delete modules yet; preserve current behavior while recording consumers and contracts.
2. The initial query-cache persistence mismatch was addressed in Phase 2; remaining integration work must verify logout/account switching and queue idempotency.
3. Static audits are guardrails, not proof of runtime offline behavior.
4. Do not remove zero-static-import candidates without checking framework entrypoints, tests, side effects, and dynamic usage.
5. Run browser tests only against a built app with a real browser context.

## Limitations

This report is source-level only. It does not prove runtime behavior, execute Vitest, perform a TypeScript project check, build Next.js, or test offline mode in a browser. Import counts are not a safe basis for deleting code.
