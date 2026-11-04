# Offline System — Phase 1 Inventory and Audit

Generated: 2026-11-04T18:19:02.680Z

## Scope and method

Static import inventory of frontend/shared/backend runtime source files. Scanned 1096 source files and identified 109 offline/cache/network/queue/warming-related modules. Import counts are static approximations: runtime registration, framework route entrypoints, worker entrypoints, dynamic imports, and string-based loading may not appear as ordinary imports. No source modules are deleted or rewritten by this script.

## Inventory by responsibility

### Connectivity and lifecycle (7)

-  frontend/lib/isNetworkLikeFailure.ts — 11 static importers; used by frontend/components/ads/AdForm.tsx, frontend/components/services/ServiceListingForm.tsx, frontend/components/shared/forms/PublishMutationErrorNotice.tsx, frontend/components/stores/ProductForm.tsx, and 7 more
-  frontend/lib/networkErrors.ts — 2 static importers; used by frontend/api/client.ts, frontend/api/media.api.ts
-  frontend/lib/networkLifecycle.ts — 10 static importers; used by frontend/components/offline/OfflineHub.tsx, frontend/components/pwa/OfflineBootstrap.tsx, frontend/components/shared/PresenceHeartbeat.tsx, frontend/hooks/queries/usePendingMessages.ts, and 6 more
-  frontend/lib/networkObservability.ts — 4 static importers; used by frontend/api/client.ts, frontend/api/media.api.ts, frontend/components/pwa/OfflineBootstrap.tsx, frontend/lib/connectionQuality.ts
-  frontend/lib/networkPolicy.ts — 22 static importers; used by frontend/api/client.ts, frontend/api/media.api.ts, frontend/components/ads/SearchResults.tsx, frontend/components/pwa/OfflineBootstrap.tsx, and 18 more
-  frontend/lib/networkRequestMonitor.ts — 4 static importers; used by frontend/components/admin/AdminConsolePanel.tsx, frontend/components/admin/AdminMonitoringCenter.tsx, frontend/components/admin/AdminNetworkRequestsPanel.tsx, frontend/components/debug/DeviceErrorCapture.tsx
-  frontend/lib/offlineError.ts — 2 static importers; used by frontend/lib/offline/index.ts, frontend/lib/sales-offline/salesSync.ts

### Data cache and freshness (23)

-  frontend/lib/cache/cacheContract.ts — 1 static importer; used by frontend/lib/cache/queryCacheInvalidation.ts
-  frontend/lib/cache/cacheInvalidationRegistry.ts — 2 static importers; used by frontend/lib/cache/queryCacheInvalidation.ts, frontend/lib/offlineCacheInvalidation.ts
-  frontend/lib/cache/cacheKey.ts — 1 static importer; used by frontend/lib/offlineCacheInvalidation.ts
-  frontend/lib/cache/cacheRegistry.ts — 0 static importers
-  frontend/lib/cache/queryCacheInvalidation.ts — 1 static importer; used by frontend/api/client.ts
-  frontend/lib/cachePolicy.ts — 5 static importers; used by frontend/hooks/mutations/useAuthMutations.ts, frontend/hooks/queries/useAuth.ts, frontend/lib/offlineCachePolicy.ts, frontend/lib/offlineFreshness.ts, and 1 more
-  frontend/lib/cacheVersion.ts — 3 static importers; used by frontend/lib/offlineCoreBundle.ts, frontend/lib/offlineRouteShells.ts, frontend/lib/offlineWarmingUserData.ts
-  frontend/lib/networkCachePolicy.ts — 3 static importers; used by frontend/hooks/queries/useAds.ts, frontend/hooks/queries/useProducts.ts, frontend/hooks/queries/useServiceListings.ts
-  frontend/lib/notificationsCache.ts — 4 static importers; used by frontend/hooks/mutations/useAuthMutations.ts, frontend/hooks/queries/useNotifications.ts, frontend/lib/authCleanup.ts, frontend/lib/offlineCacheInvalidation.ts
-  frontend/lib/offlineCacheEnvelope.ts — 2 static importers; used by frontend/lib/offlineJsonCache.ts, frontend/lib/offlineListCache.ts
-  frontend/lib/offlineCacheInvalidation.ts — 1 static importer; used by frontend/components/pwa/OfflineBootstrap.tsx
-  frontend/lib/offlineCachePolicy.ts — 6 static importers; used by frontend/hooks/queries/useAppointments.ts, frontend/hooks/queries/useServiceListings.ts, frontend/hooks/queries/useStores.ts, frontend/lib/offline/index.ts, and 2 more
-  frontend/lib/offlineFreshness.ts — 7 static importers; used by frontend/components/offline/OfflineFreshnessBadge.tsx, frontend/components/offline/OfflineStatusNotices.tsx, frontend/components/shared/NetworkStatusBanner.tsx, frontend/lib/offline/index.ts, and 3 more
-  frontend/lib/offlineJsonCache.ts — 13 static importers; used by frontend/hooks/queries/useAppointments.ts, frontend/hooks/queries/useAuth.ts, frontend/hooks/queries/useSellers.ts, frontend/hooks/queries/useServiceProviders.ts, and 9 more
-  frontend/lib/offlineListCache.ts — 18 static importers; used by frontend/components/ads/SearchResults.tsx, frontend/components/sellers/SellersRankingList.tsx, frontend/components/stores/ProductsGrid.tsx, frontend/hooks/queries/useActivity.ts, and 14 more
-  frontend/lib/offlineQueryCache.ts — 3 static importers; used by frontend/components/shared/NetworkStatusBanner.tsx, frontend/lib/authCleanup.ts, frontend/providers/AppProviders.tsx
-  frontend/lib/offlineSavedEntities.ts — 2 static importers; used by frontend/components/ads/SavedOfflineAdsPageClient.tsx, frontend/components/shared/SaveOfflineButton.tsx
-  frontend/lib/offlineSearchIndex.ts — 2 static importers; used by frontend/components/search/SearchResults.tsx, frontend/hooks/queries/useSearch.ts
-  frontend/public/cache-contract.js — 0 static importers
-  frontend/public/cache-policy.js — 0 static importers
-  shared/cache/cacheKey.ts — 0 static importers
-  workers/cf-api-proxy/cache-policy.test.mjs — 0 static importers
-  workers/cf-api-proxy/cache-probe.mjs — 0 static importers

### Mutations, drafts, queues and sync (11)

-  frontend/lib/offlineAdDraftSync.ts — 1 static importer; used by frontend/components/pwa/OfflineBootstrap.tsx
-  frontend/lib/offlineAdDrafts.ts — 18 static importers; used by frontend/components/ads/AdForm.tsx, frontend/components/offline/PendingOfflinePublishCard.tsx, frontend/components/requests/CreateRequestForm.tsx, frontend/components/services/ServiceListingForm.tsx, and 14 more
-  frontend/lib/offlineAppointmentDrafts.ts — 2 static importers; used by frontend/components/settings/SyncCenterClient.tsx, frontend/hooks/mutations/useAppointmentMutations.ts
-  frontend/lib/offlineDraftPublisher.ts — 3 static importers; used by frontend/components/pwa/OfflineBootstrap.tsx, frontend/components/settings/DraftsCenterClient.tsx, frontend/components/settings/SyncCenterClient.tsx
-  frontend/lib/offlineDraftResume.ts — 11 static importers; used by frontend/components/ads/AdForm.tsx, frontend/components/offline/PendingOfflinePublishCard.tsx, frontend/components/requests/CreateRequestForm.tsx, frontend/components/services/ServiceListingForm.tsx, and 7 more
-  frontend/lib/offlineMessagesQueue.ts — 4 static importers; used by frontend/components/messages/ChatWindow.tsx, frontend/components/messages/MessageMediaGallery.tsx, frontend/hooks/queries/usePendingMessages.ts, frontend/lib/offline/index.ts
-  frontend/lib/offlineOperationId.ts — 15 static importers; used by frontend/api/ads.api.ts, frontend/api/client.ts, frontend/api/conversations.api.ts, frontend/api/products.api.ts, and 11 more
-  frontend/lib/offlineQueue.ts — 10 static importers; used by frontend/api/client.ts, frontend/components/offline/OfflineHub.tsx, frontend/components/pwa/OfflineBootstrap.tsx, frontend/components/settings/SyncCenterClient.tsx, and 6 more
-  frontend/lib/sales-offline/salesSync.ts — 3 static importers; used by frontend/components/pwa/OfflineBootstrap.tsx, frontend/components/settings/SyncCenterClient.tsx, frontend/hooks/mutations/useSaleMutations.ts
-  frontend/lib/serialMutationQueue.ts — 2 static importers; used by frontend/hooks/mutations/useFavoriteMutations.ts, frontend/hooks/mutations/useFollowMutations.ts
-  frontend/lib/swTokenSync.ts — 1 static importer; used by frontend/components/pwa/OfflineBootstrap.tsx

### Other offline-related (25)

-  frontend/app/offline/page.tsx — 0 static importers
-  frontend/lib/imageOffline.ts — 2 static importers; used by frontend/components/shared/forms/ImageUpload.tsx, frontend/lib/imageOfflineHelpers.ts
-  frontend/lib/imageOfflineHelpers.ts — 4 static importers; used by frontend/hooks/mutations/useAdMutations.ts, frontend/hooks/mutations/useProductMutations.ts, frontend/hooks/mutations/useRequestMutations.ts, frontend/hooks/mutations/useServiceListingMutations.ts
-  frontend/lib/offline/index.ts — 0 static importers
-  frontend/lib/offlineActivityLog.ts — 3 static importers; used by frontend/components/offline/OfflineHub.tsx, frontend/components/pwa/OfflineBootstrap.tsx, frontend/lib/authCleanup.ts
-  frontend/lib/offlineAutoRead.ts — 3 static importers; used by frontend/components/ads/AdDetail.tsx, frontend/components/search/EmptySearchSuggestions.tsx, frontend/lib/authCleanup.ts
-  frontend/lib/offlineBrowseSnapshots.ts — 3 static importers; used by frontend/components/ads/SearchResults.tsx, frontend/components/stores/ProductsGrid.tsx, frontend/lib/offlineCacheInvalidation.ts
-  frontend/lib/offlineCoreBundle.ts — 2 static importers; used by frontend/app/(admin)/admin/debug/warming/page.tsx, frontend/lib/offlineSearchIndex.ts
-  frontend/lib/offlineFavoriteIntents.ts — 4 static importers; used by frontend/components/pwa/OfflineBootstrap.tsx, frontend/components/settings/SyncCenterClient.tsx, frontend/hooks/mutations/useFavoriteMutations.ts, frontend/hooks/queries/useFavorites.ts
-  frontend/lib/offlineHubPrefs.ts — 2 static importers; used by frontend/components/offline/OfflineHub.tsx, frontend/components/pwa/OfflineBootstrap.tsx
-  frontend/lib/offlineHubTabs.ts — 2 static importers; used by frontend/app/offline/page.tsx, frontend/components/offline/OfflineHub.tsx
-  frontend/lib/offlineMessagesStore.ts — 2 static importers; used by frontend/hooks/queries/useConversations.ts, frontend/lib/authCleanup.ts
-  frontend/lib/offlineMutationPolicy.ts — 1 static importer; used by frontend/lib/offlineQueue.ts
-  frontend/lib/offlineNavigationFallback.ts — 1 static importer; used by frontend/components/pwa/OfflineNavigationFallback.tsx
-  frontend/lib/offlinePublishFeedback.ts — 6 static importers; used by frontend/components/pwa/OfflineBootstrap.tsx, frontend/components/settings/SyncCenterClient.tsx, frontend/hooks/mutations/useAdMutations.ts, frontend/hooks/mutations/useProductMutations.ts, and 2 more
-  frontend/lib/offlineRouteShells.ts — 6 static importers; used by frontend/app/(admin)/admin/debug/warming/page.tsx, frontend/components/settings/OfflineControlClient.tsx, frontend/components/settings/OfflineRoutesList.tsx, frontend/lib/offlineWarmingDebug.ts, and 2 more
-  frontend/lib/offlineSelfWarm.ts — 3 static importers; used by frontend/hooks/mutations/useAuthMutations.ts, frontend/lib/offlineWarmingUserData.ts, frontend/providers/AuthHydrationProvider.tsx
-  frontend/lib/offlineShellStatus.ts — 2 static importers; used by frontend/components/offline/OfflineStatusNotices.tsx, frontend/components/pwa/OfflineBootstrap.tsx
-  frontend/lib/offlineStoragePersist.ts — 0 static importers
-  frontend/lib/offlineStoragePressure.ts — 4 static importers; used by frontend/components/settings/OfflineControlClient.tsx, frontend/lib/offlineWarmingPipeline.ts, frontend/lib/storageStats.ts, frontend/lib/warmingEngine.ts
-  frontend/lib/offlineUserScope.ts — 12 static importers; used by frontend/hooks/useFormDraft.ts, frontend/hooks/useFormDraftAttachments.ts, frontend/lib/lastKnownLocation.ts, frontend/lib/offlineActivityLog.ts, and 8 more
-  frontend/lib/offlineVisitedAds.ts — 2 static importers; used by frontend/hooks/queries/useAds.ts, frontend/lib/offlineCacheInvalidation.ts
-  frontend/lib/offlineVisitedProducts.ts — 2 static importers; used by frontend/hooks/queries/useProducts.ts, frontend/lib/offlineCacheInvalidation.ts
-  frontend/lib/offlineVisitedPublicEntities.ts — 3 static importers; used by frontend/hooks/queries/useServiceListings.ts, frontend/hooks/queries/useStores.ts, frontend/lib/offlineCacheInvalidation.ts
-  frontend/lib/useOfflineListSeed.ts — 8 static importers; used by frontend/components/sellers/SellersRankingList.tsx, frontend/hooks/queries/useAds.ts, frontend/hooks/queries/useCategories.ts, frontend/hooks/queries/useProductCategories.ts, and 4 more

### Shared contracts and Service Worker (1)

-  frontend/public/sw.js — 0 static importers

### UI and hooks (22)

-  frontend/components/admin/AdminNetworkRequestsPanel.tsx — 1 static importer; used by frontend/components/admin/AdminMonitoringCenter.tsx
-  frontend/components/admin/AdminOpsQueue.tsx — 1 static importer; used by frontend/components/admin/AdminTabsHub.tsx
-  frontend/components/ads/SavedOfflineAdsPageClient.tsx — 1 static importer; used by frontend/components/offline/OfflineHub.tsx
-  frontend/components/messages/MessageQueuedActions.tsx — 1 static importer; used by frontend/components/messages/ChatMessageRow.tsx
-  frontend/components/offline/NativeOfflineStrip.tsx — 0 static importers
-  frontend/components/offline/OfflineFreshnessBadge.tsx — 2 static importers; used by frontend/components/settings/OfflineControlClient.tsx, frontend/components/settings/SyncCenterClient.tsx
-  frontend/components/offline/OfflineHub.tsx — 1 static importer; used by frontend/app/offline/page.tsx
-  frontend/components/offline/OfflineStatusNotices.tsx — 1 static importer; used by frontend/providers/AppProviders.tsx
-  frontend/components/offline/PendingOfflinePublishCard.tsx — 3 static importers; used by frontend/components/profile/MyAdsList.tsx, frontend/components/services/MyServiceListingsList.tsx, frontend/components/stores/MyProductsList.tsx
-  frontend/components/pwa/OfflineBootstrap.tsx — 1 static importer; used by frontend/providers/AppProviders.tsx
-  frontend/components/pwa/OfflineNavigationFallback.tsx — 1 static importer; used by frontend/providers/AppProviders.tsx
-  frontend/components/pwa/WarmupIndicator.tsx — 1 static importer; used by frontend/components/pwa/OfflineBootstrap.tsx
-  frontend/components/settings/OfflineControlClient.tsx — 1 static importer; used by frontend/components/offline/OfflineHub.tsx
-  frontend/components/settings/OfflineRoutesList.tsx — 1 static importer; used by frontend/components/settings/OfflineControlClient.tsx
-  frontend/components/settings/SyncCenterClient.tsx — 1 static importer; used by frontend/components/offline/OfflineHub.tsx
-  frontend/components/shared/NetworkStatusBanner.tsx — 2 static importers; used by frontend/components/admin/AdminMonitoringCenter.tsx, frontend/providers/AppProviders.tsx
-  frontend/components/shared/OfflineActionGate.tsx — 0 static importers
-  frontend/components/shared/SaveOfflineButton.tsx — 4 static importers; used by frontend/components/ads/AdDetailMetadata.tsx, frontend/components/services/ServiceListingDetail.tsx, frontend/components/stores/ProductDetail.tsx, frontend/components/stores/StoreHeader.tsx
-  frontend/components/shared/feedback/OfflineQueryFallback.tsx — 8 static importers; used by frontend/components/ads/AdDetailSection.tsx, frontend/components/ads/SearchResults.tsx, frontend/components/requests/RequestsPageClient.tsx, frontend/components/search/SearchResults.tsx, and 4 more
-  frontend/components/shared/feedback/OfflineStaleDataNotice.tsx — 2 static importers; used by frontend/components/ads/AdDetailSection.tsx, frontend/components/stores/ProductDetailSection.tsx
-  frontend/hooks/useNetworkPolicy.ts — 5 static importers; used by frontend/components/ads/SearchResults.tsx, frontend/components/search/SearchResults.tsx, frontend/components/services/ServiceListingsGrid.tsx, frontend/components/stores/ProductsGrid.tsx, and 1 more
-  frontend/hooks/useQueuedRequestCount.ts — 4 static importers; used by frontend/api/client.ts, frontend/components/layout/BottomNav.tsx, frontend/components/offline/OfflineHub.tsx, frontend/hooks/queries/usePendingMessages.ts

### Warming and route preparation (20)

-  frontend/lib/offlineWarmingAbort.ts — 2 static importers; used by frontend/lib/offlineRouteShells.ts, frontend/lib/offlineWarmingUserData.ts
-  frontend/lib/offlineWarmingCoordinator.ts — 4 static importers; used by frontend/lib/offlineCoreBundle.ts, frontend/lib/offlineRouteShells.ts, frontend/lib/offlineWarmingDebug.ts, frontend/lib/offlineWarmingUserData.ts
-  frontend/lib/offlineWarmingDebug.ts — 1 static importer; used by frontend/app/(admin)/admin/debug/warming/page.tsx
-  frontend/lib/offlineWarmingPipeline.ts — 3 static importers; used by frontend/components/pwa/OfflineBootstrap.tsx, frontend/components/settings/OfflineControlClient.tsx, frontend/lib/offlineWarmingScheduler.ts
-  frontend/lib/offlineWarmingPlanner.ts — 6 static importers; used by frontend/lib/offlineCoreBundle.ts, frontend/lib/offlineRouteShells.ts, frontend/lib/offlineWarmingDebug.ts, frontend/lib/offlineWarmingScheduler.ts, and 2 more
-  frontend/lib/offlineWarmingReport.ts — 2 static importers; used by frontend/lib/offlineCoreBundle.ts, frontend/lib/offlineRouteShells.ts
-  frontend/lib/offlineWarmingScheduler.ts — 1 static importer; used by frontend/components/pwa/OfflineBootstrap.tsx
-  frontend/lib/offlineWarmingState.ts — 6 static importers; used by frontend/app/(admin)/admin/debug/warming/page.tsx, frontend/components/settings/OfflineControlClient.tsx, frontend/components/settings/OfflineRoutesList.tsx, frontend/lib/authCleanup.ts, and 2 more
-  frontend/lib/offlineWarmingUserData.ts — 0 static importers
-  frontend/lib/warmingBroadcast.ts — 1 static importer; used by frontend/lib/warmingProgress.ts
-  frontend/lib/warmingBudget.ts — 4 static importers; used by frontend/lib/offlineCoreBundle.ts, frontend/lib/offlineWarmingPlanner.ts, frontend/lib/warmingEngine.ts, frontend/lib/warmingRuntimeBudget.ts
-  frontend/lib/warmingEngine.ts — 1 static importer; used by frontend/lib/offlineWarmingPipeline.ts
-  frontend/lib/warmingManifest.ts — 1 static importer; used by frontend/lib/offlineRouteShells.ts
-  frontend/lib/warmingPreferences.ts — 6 static importers; used by frontend/components/settings/OfflineControlClient.tsx, frontend/lib/offlineCoreBundle.ts, frontend/lib/offlineRouteShells.ts, frontend/lib/offlineSelfWarm.ts, and 2 more
-  frontend/lib/warmingPriorityQueue.ts — 1 static importer; used by frontend/lib/warmingEngine.ts
-  frontend/lib/warmingProgress.ts — 6 static importers; used by frontend/components/pwa/WarmupIndicator.tsx, frontend/components/settings/OfflineControlClient.tsx, frontend/lib/offlineCoreBundle.ts, frontend/lib/offlineRouteShells.ts, and 2 more
-  frontend/lib/warmingQueryContract.ts — 2 static importers; used by frontend/lib/offlineCoreBundle.ts, frontend/lib/offlineWarmingUserData.ts
-  frontend/lib/warmingRegistry.ts — 2 static importers; used by frontend/lib/warmingEngine.ts, frontend/lib/warmingPriorityQueue.ts
-  frontend/lib/warmingRuntimeBudget.ts — 4 static importers; used by frontend/lib/offlineCoreBundle.ts, frontend/lib/offlineRouteShells.ts, frontend/lib/offlineWarmingUserData.ts, frontend/lib/warmingEngine.ts
-  frontend/lib/warmingTelemetry.ts — 5 static importers; used by frontend/hooks/useNavigationUsage.ts, frontend/lib/offlineCoreBundle.ts, frontend/lib/offlineRouteShells.ts, frontend/lib/offlineWarmingUserData.ts, and 1 more

## Findings requiring action

- No known Phase 1 guardrail mismatch detected by the current checks.

## Zero-static-import candidates (review only; do not auto-delete)

- frontend/components/offline/NativeOfflineStrip.tsx — zero static importers in the scanned source set. Check framework entrypoints, tests, side effects, and dynamic usage before deciding whether it is dead code.
- frontend/components/shared/OfflineActionGate.tsx — zero static importers in the scanned source set. Check framework entrypoints, tests, side effects, and dynamic usage before deciding whether it is dead code.
- frontend/lib/cache/cacheRegistry.ts — zero static importers in the scanned source set. Check framework entrypoints, tests, side effects, and dynamic usage before deciding whether it is dead code.
- frontend/lib/offlineStoragePersist.ts — zero static importers in the scanned source set. Check framework entrypoints, tests, side effects, and dynamic usage before deciding whether it is dead code.
- frontend/lib/offlineWarmingUserData.ts — zero static importers in the scanned source set. Check framework entrypoints, tests, side effects, and dynamic usage before deciding whether it is dead code.

## Phase 2 updates

- Replaced broad contract-prefix persistence with a shape-aware allowlist for known public query-key forms. Private/admin siblings, user-owned resources, stock data, search text, coordinates, and the identity-bearing personalized home-feed branch are excluded.
- Restore checks key identity, timestamp bounds, actual stable-serialized UTF-8 byte size, and the recorded byte count. Ordinary query entries are capped at 512 KiB; the unified homepage feed has a dedicated 2 MiB cap.
- Preserved the 500-entry, 20 MiB aggregate, and seven-day limits. Regression coverage includes private/admin sibling keys, contextual params, payload size limits, corrupted byte counts, and invalid timestamps.
- Static phase 2 guardrail and dependency-free phase 1 guardrail pass. Vitest, full TypeScript validation, production build, and real-browser offline tests still require installed project dependencies and a browser run.

## Phase 1 decisions

1. Do not merge or delete modules yet; preserve current behavior while recording consumers and contracts.
2. The initial query-cache persistence mismatch was addressed in Phase 2; remaining integration work must verify logout/account switching and queue idempotency.
3. Static audits are guardrails, not proof of runtime offline behavior.
4. Do not remove zero-static-import candidates without checking framework entrypoints, tests, side effects, and dynamic usage.
5. Run browser tests only against a built app with a real browser context.

## Limitations

This report is source-level only. It does not prove runtime behavior, execute Vitest, perform a TypeScript project check, build Next.js, or test offline mode in a browser. Import counts are not a safe basis for deleting code.
