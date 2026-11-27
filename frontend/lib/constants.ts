import { DOMAIN_STATUS_LABELS } from '@marketplat/contracts';
import type { AdSortField, AdSortOrder } from '@/types/ad.types';
import { getRawApiUrl, getRawAppUrl } from '@/lib/env';
import type { StoreSortField } from '@/types/store.types';
import type { ProductSortField } from '@/types/product.types';
import type { ServiceListingSortField } from '@/types/service.types';
import { cachePolicy } from '@/lib/cachePolicy';

export const APP_NAME = 'سوق غزة';
const PRODUCTION_APP_URL = 'https://marketplat.esamnajjar6.workers.dev';
const FALLBACK_APP_URL = process.env.NODE_ENV === 'production' ? PRODUCTION_APP_URL : 'http://localhost:3000';
export const APP_URL = getRawAppUrl() ?? FALLBACK_APP_URL;

export const ROUTES = {
  home:          '/',
  about:         '/about',
  privacy:       '/privacy',
  terms:         '/terms',
  contact:       '/contact',
  login:         '/login',
  register:      '/register',
  // FEAT-GOOGLE-COMPLETE-PROFILE: post-Google-signup step (name + city)
  // — see ProfileCompletionGate.tsx and app/complete-profile/page.tsx.
  completeProfile: '/complete-profile',
  forgotPassword:'/forgot-password',
  resetPassword: '/reset-password',
  search:        '/search',
  ads:           '/ads',
  adCreate:      '/ads/create',
  adDetail:      (id: string)   => `/ads/${id}`,
  productDetail: (id: string)   => `/products/${id}`,
  // REORG-03: was `/my-ads/${id}` — renamed to match the edit-route
  // naming pattern used by myServiceEdit/myStoreProductEdit below.
  adEdit:        (id: string)   => `/my-ads/${id}/edit`,
  categories:    '/categories',
  suggestions:   '/suggestions',
  trending:      '/trending',
  forYou:        '/for-you',
  promoted:      '/promoted',
  category:      (slug: string) => `/categories/${slug}`,
  userProfile:   (id: string)   => `/profile/${id}`,
  userFollowers: (id: string) => `/profile/${id}/followers`,
  userFollowing: (id: string) => `/profile/${id}/following`,
  following: '/following',
  sellerProfile: (id: string)   => `/sellers/${id}`,
  myAds:         '/activity?tab=ads',  // ACTIVITY-HUB-01
  favorites:     '/favorites',
  sellersRanking: '/sellers/ranking',
  savedSearches: '/saved-searches',
  savedPayments: '/saved-payments',
  activity:      '/activity',
  // FEAT-REPORT-USER-STORE: "بلاغاتي" — a reporter's own filed reports.
  myReports:     '/activity?tab=reports',  // ACTIVITY-HUB-01
  messages:      '/messages',
  notifications: '/notifications',
  conversationDetail: (id: string) => `/messages/${id}`,
  dashboard:     '/dashboard',
  sales:               '/account/sales',
  orders:              '/orders',
  marketplaceOrder:    (id: string) => `/orders/${id}`,
  salesSales:          '/account/sales?tab=sales',
  salesCustomers:      '/account/sales?tab=customers',
  salesDebts:          '/account/sales?tab=debts',
  salesInstallments:   '/account/sales?tab=installments',
  salesAnalytics:      '/account/sales?tab=analytics',
  customers:           '/account/customers',  // legacy — redirects into /account/sales?tab=customers
  services:            '/services',
  serviceDetail:        (id: string) => `/services/${id}`,
  serviceProviders:      '/service-providers',
  serviceProvider:       (id: string) => `/service-providers/${id}`,
  myServices:           '/my-services',
  myServiceCreate:      '/my-services/new',
  myServiceEdit:         (id: string) => `/my-services/${id}/edit`,
  // Epic 3.1: customer-side "my requests" list, and provider-side inbox.
  myServiceRequests:     '/activity?tab=requests',  // service requests I SENT to providers  // ACTIVITY-HUB-01
  // MY-SERVICES-HUB-01: these three are TABS of /my-services (see lib/myServicesHubTabs.ts).
  // Never append '?x=y' to them — use myServicesTabHref(tab, {x:'y'}) instead.
  incomingServiceRequests: '/my-services?tab=requests',
  // AUDIT-FIX (issue #6): GET /service-requests/:id + useServiceRequest
  // existed fully but had no page — full details/attachedImages were
  // clipped to two lines in the list rows with no way to see more.
  serviceRequestDetail:  (id: string) => `/service-requests/${id}`,
  // Epic 4: provider-side appointments calendar.
  myServiceAppointments:   '/my-services?tab=appointments',
  // ANALYTICS: mirrors myStoreAnalytics below.
  myServiceProviderAnalytics: '/my-services?tab=analytics',
  // T780 — service-broadcasts routes removed. Backend dropped the
  // service_request_broadcasts / service_quotes tables (migration
  // 20260917121810); the pages under app/(protected)/service-broadcasts/
  // no longer exist. Confirmed dead across the frontend: no component,
  // no hook, no API client, and grep found only stale references in
  // proxy.ts's PROTECTED_PREFIXES (also removed) and admin.layout's
  // MODERATOR_ALLOWED_PREFIXES (also removed). The replacement feature
  // is /requests (open-requests marketplace).
  // Open Requests marketplace (SERVICE | PRODUCT | RENTAL)
  requests: '/requests',
  request: (id: string) => `/requests/${id}`,
  requestNew: '/requests/new',
  // Open-requests market: requests I POSTED (≠ myServiceRequests above).
  myOpenRequests: '/requests/me',
  myOpenRequestOffers: '/requests/offers',
  stores:               '/stores',
  storeDetail:           (id: string) => `/stores/${id}`,
  // FEAT-HOME-DISCOVERY: public cross-store products browse page —
  // distinct from myStoreProducts below (owner-only management list)
  // and from ProductCard's own per-store deep link. Backed by the
  // existing GET /products (useProducts with no storeId), no new API.
  products:             '/products',
  myStore:              '/my-store',
  // MY-STORE-HUB-01: these seven are TABS of /my-store now (see lib/myStoreHubTabs.ts).
  // Never append '?x=y' to them — use myStoreTabHref(tab, {x:'y'}) instead.
  myStoreInventory:      '/my-store?tab=inventory',
  myStoreMembers:        '/my-store?tab=members',
  myStoreProducts:       '/my-store?tab=products',
  myStoreProductCreate:  '/my-store/products/new',
  myStoreProductEdit:    (id: string) => `/my-store/products/${id}/edit`,
  myStorePromotions:     '/my-store?tab=promotions',
  // P1: owner-facing collections tab + per-collection product manager.
  myStoreCollections:      '/my-store?tab=collections',
  myStoreCollectionManage: (id: string) => `/my-store/collections/${id}`,
  // STORE-ANALYTICS (Foundation v1)
  myStoreAnalytics:      '/my-store?tab=analytics',
  myStoreSettings:      '/my-store?tab=settings',
  myFollowedStores:     '/my-store/followed',
  settings: {
    // SETTINGS-HUB-01 (SETTINGS-HUB-CONST-RESTORE): one route; tabs in ?tab=…
    // `root` is the bare pathname (for pathname === comparisons), `profile` the
    // default-tab href. Same URL today, different intent — keep both.
    root:          '/settings',
    profile:       '/settings',
    security:      '/settings?tab=security',
    sessions:      '/settings?tab=sessions',
    notifications: '/settings?tab=notifications',
    seller:        '/settings?tab=profile&section=seller',
    serviceProvider: '/settings?tab=profile&section=service',
    blockedUsers:  '/settings?tab=blocked-users',
  },
  // ROUTE-FIX-01: everything offline-related lives under one `offline` group
  // (OFFLINE-HUB-01: /offline is one hub with ?tab=…). Previously
  // settings.storage/sync/drafts/offline pointed at /offline but were named
  // as if they lived under /settings, and downloads/savedAds were two keys
  // for the same URL. Link straight to the hub (not the legacy /settings/*
  // or /downloads redirects) so soft navigation works with no network.
  offline: {
    hub:     '/offline',
    saved:   '/offline?tab=saved',   // was downloads + savedAds (/saved-ads, /downloads)
    storage: '/offline?tab=storage',
    sync:    '/offline?tab=sync',
    drafts:  '/offline?tab=drafts',
    // Warming Engine user controls (was settings.offline).
    warming: '/offline?tab=warming',
  },
  admin: {
    // ADMIN-HUB-01: every admin section is a TAB of /admin now (see
    // lib/adminHubTabs.ts). Never append '?x=y' to these — use
    // adminTabHref(tab, {x:'y'}) instead. `dashboard` is the bare hub: a
    // MODERATOR, who has no dashboard tab, lands on their default tab there.
    // `root` = pathname for comparisons, `dashboard` = href for the dashboard tab.
    root:              '/admin',
    dashboard:         '/admin',
    ads:               '/admin?tab=ads',
    users:             '/admin?tab=users',
    reports:           '/admin?tab=reports',
    categories:        '/admin?tab=categories',
    // Epic 1.1: admin verify/suspend UI — was entirely missing.
    sellers:           '/admin?tab=sellers',
    // Epic 1.2: admin service-categories management — was entirely missing.
    serviceCategories: '/admin?tab=service-categories',
    stores:            '/admin?tab=stores',
    storeTypes:        '/admin?tab=store-types',
    productCategories: '/admin?tab=product-categories',
    auditLogs:         '/admin?tab=audit-logs',
    // Gap #7 (product analytics): dashboard for GET /admin/analytics/summary.
    analytics:         '/admin?tab=analytics',
    infrastructure:    '/admin?tab=infrastructure',
    // FRAUD-UI: /admin/fraud/* backend module had no reachable page.
    fraud:             '/admin?tab=fraud',
    products:          '/admin?tab=products',
    serviceListings:   '/admin?tab=service-listings',
    openRequests:      '/admin?tab=open-requests',
    serviceRequestDisputes: '/admin?tab=service-request-disputes',
    notifications:     '/admin?tab=notifications',
    system:            '/admin?tab=system',
  },
} as const;

export const CITIES = [
  'غزة', 'خان يونس', 'رفح', 'دير البلح', 'بيت لاهيا',
  'بيت حانون', 'جباليا', 'النصيرات', 'المغازي', 'البريج',
] as const;

export const CONDITION_LABELS: Record<string, string> = DOMAIN_STATUS_LABELS.adCondition;

/** Keys and labels are owned by the shared domain contract. */
export const STATUS_LABELS: Record<string, string> = DOMAIN_STATUS_LABELS.ad;

/** Report labels are owned by the shared domain contract. */
export const REPORT_REASON_LABELS: Record<string, string> = DOMAIN_STATUS_LABELS.reportReason;

/** Report lifecycle labels are owned by the shared domain contract. */
export const REPORT_STATUS_LABELS: Record<string, string> = DOMAIN_STATUS_LABELS.report;

/** Must match the backend Prisma `AuditEventType` enum exactly (prisma/schema.prisma). */
export const AUDIT_EVENT_LABELS: Record<string, string> = DOMAIN_STATUS_LABELS.auditEvent;

export const AD_SORT_OPTIONS: readonly { label: string; sortBy: AdSortField; sortOrder: AdSortOrder }[] = [
  { label: 'الأحدث',       sortBy: 'createdAt', sortOrder: 'desc' },
  { label: 'الأقدم',       sortBy: 'createdAt', sortOrder: 'asc'  },
  { label: 'السعر (أقل)',   sortBy: 'price',     sortOrder: 'asc'  },
  { label: 'السعر (أعلى)', sortBy: 'price',     sortOrder: 'desc' },
  { label: 'الأكثر مشاهدة', sortBy: 'views',    sortOrder: 'desc' },
] as const;

// FIX BUG-02: StoresGrid (components/stores/StoresGrid.tsx) already reads
// and applies search/city/sortBy/sortOrder from the URL in full — the
// backend/query layer support was always complete. Only a visible filter
// UI was missing from the /stores page itself, leaving those params
// reachable by hand-editing the URL only. Mirrors AD_SORT_OPTIONS' shape
// so the new StoresFilters component can follow the same select pattern.
export const PRODUCT_SORT_OPTIONS: readonly { label: string; sortBy: ProductSortField; sortOrder: AdSortOrder }[] = [
  { label: 'الأحدث', sortBy: 'createdAt', sortOrder: 'desc' },
  { label: 'الأقدم', sortBy: 'createdAt', sortOrder: 'asc' },
  { label: 'السعر (أقل)', sortBy: 'price', sortOrder: 'asc' },
  { label: 'السعر (أعلى)', sortBy: 'price', sortOrder: 'desc' },
  { label: 'الأكثر مشاهدة', sortBy: 'views', sortOrder: 'desc' },
] as const;

export const SERVICE_SORT_OPTIONS: readonly { label: string; sortBy: ServiceListingSortField; sortOrder: AdSortOrder }[] = [
  { label: 'الأحدث', sortBy: 'createdAt', sortOrder: 'desc' },
  { label: 'الأقدم', sortBy: 'createdAt', sortOrder: 'asc' },
  { label: 'السعر (أقل)', sortBy: 'price', sortOrder: 'asc' },
  { label: 'السعر (أعلى)', sortBy: 'price', sortOrder: 'desc' },
  { label: 'الأكثر مشاهدة', sortBy: 'views', sortOrder: 'desc' },
] as const;

export const STORE_SORT_OPTIONS: readonly { label: string; sortBy: StoreSortField; sortOrder: AdSortOrder }[] = [
  { label: 'الأحدث', sortBy: 'createdAt', sortOrder: 'desc' },
  { label: 'الأقدم', sortBy: 'createdAt', sortOrder: 'asc'  },
  { label: 'الاسم (أ-ي)', sortBy: 'name', sortOrder: 'asc'  },
  { label: 'الاسم (ي-أ)', sortBy: 'name', sortOrder: 'desc' },
] as const;

/** Must match backend upload.middleware.ts: upload.array('images', 10) */
export const MAX_IMAGES = 10;
export const MAX_FILE_SIZE_MB = 5;

/** Must match backend upload.middleware.ts: ALLOWED_MIME_TYPES exactly. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;

/** How often the frontend refreshes its own online marker. The backend
 * presence key has a 200s TTL, leaving 80s beyond this 120s interval for
 * scheduling and network delay. A fully missed interval may briefly show
 * offline until the next tick; visibility/network resume sends an immediate beat. */
export const PRESENCE_HEARTBEAT_INTERVAL = 120_000;

/** Base URL for the backend API, consumed by api/client.ts */
// SW-SSR-CLIENT-SPLIT-01: server-side (RSC, generateMetadata, server
// actions) needs an ABSOLUTE URL — axios cannot resolve a relative
// baseURL in Node/Workers runtime. The previous PROXY-API-01 patch used
// a bare '/api/v1' in production, which worked in the browser
// (same-origin via Worker rewrites) but silently broke every server
// component that calls the API: /profile/[id], /products/[id],
// /ads/[id], /stores/[id], and any other RSC page with generateMetadata
// or a server-side fetch. The user saw "المستخدم غير موجود" on their
// own profile page while online — a 404 caught and swallowed by the
// page's try/catch.
//
// API origin is absolute for browser auth redirects and server-side reads.
// Ordinary browser API requests are routed through the same-origin proxy by
// the API client configuration below.
export const PRODUCTION_API_ORIGIN = 'https://marketplat-api.esamnajjar6.workers.dev';

export const API_BASE_URL = (() => {
  // Production browser/server API calls use the dedicated API Worker.
  if (process.env.NODE_ENV === 'production') {
    return `${PRODUCTION_API_ORIGIN}/api/v1`;
  }
  return getRawApiUrl() || 'http://localhost:5000/api/v1';
})();

/**
 * TanStack Query stale times — centralised so every hook uses
 * the same TTL values and they can be tuned in one place.
 */
export const CACHE_TTL = {
  // Every cache duration is resolved from shared/cache-policy.json. Feature
  // names here are compatibility aliases for the shared queryDefaults/domains.
  adsList:     cachePolicy('publicLive').client.staleTimeMs,     // [policy] publicLive
  adDetail:    cachePolicy('staticDetail').client.staleTimeMs,   // [policy] staticDetail
  myAds:       cachePolicy('queryDefaults').myAds.staleTimeMs,
  categories:  cachePolicy('reference').client.staleTimeMs, // [policy] reference
  // Store business types (pharmacy/restaurant/...) — admin-managed
  // reference list. Shorter than categories: a label/icon tweak by an
  // admin should propagate within a browsing session, not after an hour.
  storeTypes:  cachePolicy('queryDefaults').storeTypes.staleTimeMs,
  userProfile: cachePolicy('privateUserProfile').client.staleTimeMs, // [policy] privateUserProfile
  // [policy] personal. Mounting SellerVerificationBanner, BecomeStoreOwnerCard and
  // BecomeServiceProviderCard together still shares one fetch (fresh within the window +
  // in-flight dedupe); useSellerMutations invalidates explicitly.
  sellerProfile: cachePolicy('personal').client.staleTimeMs,
  publicProfile: cachePolicy('queryDefaults').publicProfile.staleTimeMs,
  sessions:    cachePolicy('queryDefaults').sessions.staleTimeMs,
  favorites:   cachePolicy('personal').client.staleTimeMs, // [policy] personal
  adminList:   cachePolicy('queryDefaults').adminList.staleTimeMs,
  // Gap #7 (product analytics): aggregated over a date range, not a
  // live list — changes far less per-minute than adminList's paginated
  // tables, so a longer TTL avoids re-running the trend/category/funnel
  // aggregations on every sidebar revisit within the same session.
  adminAnalytics: cachePolicy('queryDefaults').adminAnalytics.staleTimeMs,
  // Gap #9 (recommendations): response is personalized per caller (see
  // backend recommendations.routes.ts's CACHE.NONE — no shared HTTP
  // cache is possible), so this is purely the client-side React Query
  // staleTime. Matches adsList's 30s: a fresh favorite/view should
  // reasonably show up in the rail within the same browsing session.
  recommendations: cachePolicy('recommendations').client.staleTimeMs, // [policy] recommendations
  // Epic 3.1: service requests move through PENDING/ACCEPTED/etc fairly
  // often (a provider can respond any time), so keep this shorter than
  // myAds — same reasoning as adsList's 30s over categories' 5m.
  serviceRequests: cachePolicy('queryDefaults').serviceRequests.staleTimeMs,
  // Reviews are append-only and change far less often than a request's
  // live status — closer to sellerProfile's 60s than serviceRequests' 20s.
  serviceReviews: cachePolicy('queryDefaults').serviceReviews.staleTimeMs,
  // Epic 4: a provider's own appointment list changes about as often as
  // their service requests (status flips on completion/cancellation) —
  // same 20s as serviceRequests. Availability is shorter: two customers
  // racing for the same slot need a fresher view, and the backend's own
  // race-protection (findOverlapping inside withProviderScheduleLock)
  // is the real source of truth at booking time regardless.
  appointments: cachePolicy('queryDefaults').appointments.staleTimeMs,
  availability: cachePolicy('queryDefaults').availability.staleTimeMs,
  // The open thread is updated through the unified SSE stream. This client
  // TTL is a cache freshness fallback, not a polling interval.
  conversations: cachePolicy('messages').client.staleTimeMs, // [policy] messages
  messages: cachePolicy('messages').client.staleTimeMs,      // [policy] messages
  // Background badge cache. It is intentionally much less volatile than
  // the active thread and is not polled on a timer.
  conversationUnreadCount: cachePolicy('queryDefaults').conversationUnreadCount.staleTimeMs,
  // Presence is cached for one minute; it is fetched in one bulk request
  // for the visible inbox participants rather than polling each row.
  presence: cachePolicy('queryDefaults').presence.staleTimeMs,
  // Notification badge freshness fallback; SSE invalidates the notification
  // queries when a notification event arrives.
  notifications: cachePolicy('messages').client.staleTimeMs, // [policy] messages
  // A user's own activity timeline — generated by other modules'
  // services as a side effect of real actions, not polled the way an
  // inbox is. No UI element needs it "live" the way the notification
  // bell does, so this matches favorites' 60s over notifications' 15s.
  activity: cachePolicy('personal').client.staleTimeMs, // [policy] personal
  // Sales aggregates are stable between explicit sale/payment mutations;
  // mutations invalidate the sales query family so a short client cache is safe.
  salesData: cachePolicy('queryDefaults').salesData.staleTimeMs,
  salesList: cachePolicy('queryDefaults').salesList.staleTimeMs,
  // A user's saved-search list changes only when they explicitly
  // create/delete one — no server-side process mutates it in the
  // background the way a conversation or notification does. Matches
  // categories' 5m as a "rarely changes, safe to cache long" TTL.
  savedSearches: cachePolicy('personal').client.staleTimeMs, // [policy] personal
  // Unified search: same volatility as adsList (its own results are a
  // superset that includes ads) — 90s N2 for weak nets without
  // re-querying on every keystroke-triggered re-render.
  search: cachePolicy('publicLive').client.staleTimeMs, // [policy] publicLive, same as adsList
  // Suggestions change far less than search results (a new product
  // name only starts appearing once that product exists) and the
  // backend already caches this server-side for 5 minutes (see
  // search.service.ts's SUGGESTIONS_TTL) — a short client staleTime
  // just avoids re-fetching on every keystroke within the same debounce
  // window, the server-side cache absorbs the rest.
  searchSuggestions: cachePolicy('queryDefaults').searchSuggestions.staleTimeMs,
  homePrefetch: cachePolicy('queryDefaults').homePrefetch.staleTimeMs,
  publicFeatureFlags: cachePolicy('queryDefaults').publicFeatureFlags.staleTimeMs,
  marketplaceOrders: cachePolicy('queryDefaults').marketplaceOrders.staleTimeMs,
  marketplaceOrderDetail: cachePolicy('queryDefaults').marketplaceOrderDetail.staleTimeMs,
  adminAlwaysFresh: cachePolicy('queryDefaults').adminAlwaysFresh.staleTimeMs,
  adminStoreTypes: cachePolicy('queryDefaults').adminStoreTypes.staleTimeMs,
  adminStoreTypeFields: cachePolicy('queryDefaults').adminStoreTypeFields.staleTimeMs,
  debts: cachePolicy('queryDefaults').debts.staleTimeMs,
  notificationDevices: cachePolicy('queryDefaults').notificationDevices.staleTimeMs,
  salesCostSettings: cachePolicy('queryDefaults').salesCostSettings.staleTimeMs,
  salesCostProducts: cachePolicy('queryDefaults').salesCostProducts.staleTimeMs,
  salesDebtSummary: cachePolicy('queryDefaults').salesDebtSummary.staleTimeMs,
  salesDashboard: cachePolicy('queryDefaults').salesDashboard.staleTimeMs,
  salesReceipt: cachePolicy('queryDefaults').salesReceipt.staleTimeMs,
  salesReport: cachePolicy('queryDefaults').salesReport.staleTimeMs,
  salesSmartInsights: cachePolicy('queryDefaults').salesSmartInsights.staleTimeMs,
  storyFeed: cachePolicy('queryDefaults').storyFeed.staleTimeMs,
  storyViewers: cachePolicy('queryDefaults').storyViewers.staleTimeMs,
  conversationDetail: cachePolicy('queryDefaults').conversationDetail.staleTimeMs,
  customers: cachePolicy('queryDefaults').customers.staleTimeMs,
  installments: cachePolicy('queryDefaults').installments.staleTimeMs,
  storeTypeFields: cachePolicy('queryDefaults').storeTypeFields.staleTimeMs,
  followCounts: cachePolicy('queryDefaults').followCounts.staleTimeMs,
  publicSalesStats: cachePolicy('queryDefaults').publicSalesStats.staleTimeMs,
  sellersRanking: cachePolicy('queryDefaults').sellersRanking.staleTimeMs,
  serviceListingMatches: cachePolicy('queryDefaults').serviceListingMatches.staleTimeMs,
} as const;

/** Query garbage-collection windows, kept separate from freshness TTLs. */
export const CACHE_GC_TTL = {
  publicFeatureFlags: cachePolicy('queryDefaults').publicFeatureFlags.gcTimeMs,
} as const;
