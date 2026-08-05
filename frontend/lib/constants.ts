import type { AdSortField, AdSortOrder } from '@/types/ad.types';
import type { StoreSortField } from '@/types/store.types';

export const APP_NAME = 'سوق غزة';
export const APP_URL  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const ROUTES = {
  home:          '/',
  login:         '/login',
  register:      '/register',
  forgotPassword:'/forgot-password',
  resetPassword: '/reset-password',
  search:        '/search',
  adCreate:      '/ads/create',
  adDetail:      (id: string)   => `/ads/${id}`,
  adEdit:        (id: string)   => `/my-ads/${id}`,
  category:      (slug: string) => `/categories/${slug}`,
  userProfile:   (id: string)   => `/profile/${id}`,
  sellerProfile: (id: string)   => `/sellers/${id}`,
  myAds:         '/my-ads',
  favorites:     '/favorites',
  savedSearches: '/saved-searches',
  messages:      '/messages',
  conversationDetail: (id: string) => `/messages/${id}`,
  dashboard:     '/dashboard',
  services:            '/services',
  serviceDetail:        (id: string) => `/services/${id}`,
  serviceProviders:      '/service-providers',
  serviceProvider:       (id: string) => `/service-providers/${id}`,
  myServices:           '/my-services',
  myServiceCreate:      '/my-services/new',
  myServiceEdit:         (id: string) => `/my-services/${id}/edit`,
  // Epic 3.1: customer-side "my requests" list, and provider-side inbox.
  myServiceRequests:     '/my-requests',
  incomingServiceRequests: '/my-services/requests',
  // AUDIT-FIX (issue #6): GET /service-requests/:id + useServiceRequest
  // existed fully but had no page — full details/attachedImages were
  // clipped to two lines in the list rows with no way to see more.
  serviceRequestDetail:  (id: string) => `/service-requests/${id}`,
  // Epic 4: provider-side appointments calendar.
  myServiceAppointments:   '/my-services/appointments',
  stores:               '/stores',
  storeDetail:           (id: string) => `/stores/${id}`,
  myStore:              '/my-store',
  myStoreProducts:       '/my-store/products',
  myStoreProductCreate:  '/my-store/products/new',
  myStoreProductEdit:    (id: string) => `/my-store/products/${id}/edit`,
  myFollowedStores:     '/my-store/followed',
  settings: {
    root:          '/settings',
    profile:       '/settings/profile',
    security:      '/settings/security',
    sessions:      '/settings/sessions',
    notifications: '/settings/notifications',
    seller:        '/settings/seller',
    serviceProvider: '/settings/service-provider',
    blockedUsers:  '/settings/blocked-users',
  },
  admin: {
    root:              '/admin',
    dashboard:         '/admin/dashboard',
    ads:               '/admin/ads',
    users:             '/admin/users',
    reports:           '/admin/reports',
    categories:        '/admin/categories',
    // Epic 1.1: admin verify/suspend UI — was entirely missing.
    sellers:           '/admin/sellers',
    // Epic 1.2: admin service-categories management — was entirely missing.
    serviceCategories: '/admin/service-categories',
    stores:            '/admin/stores',
    productCategories: '/admin/product-categories',
    auditLogs:         '/admin/audit-logs',
    // Gap #7 (product analytics): dashboard for GET /admin/analytics/summary.
    analytics:         '/admin/analytics',
  },
} as const;

export const CITIES = [
  'غزة', 'خان يونس', 'رفح', 'دير البلح', 'بيت لاهيا',
  'بيت حانون', 'جباليا', 'النصيرات', 'المغازي', 'البريج',
] as const;

export const CONDITION_LABELS: Record<string, string> = {
  NEW:         'جديد',
  USED:        'مستعمل',
  REFURBISHED: 'مجدد',
};

/** Keys must match AdStatus exactly: ACTIVE | SOLD | DELETED (see types/ad.types.ts). */
export const STATUS_LABELS: Record<string, string> = {
  ACTIVE:  'نشط',
  SOLD:    'تم البيع',
  DELETED: 'محذوف',
};

/** Must match the backend Prisma `ReportReason` enum exactly (prisma/schema.prisma). */
export const REPORT_REASON_LABELS: Record<string, string> = {
  SCAM:      'عملية احتيال',
  FAKE:      'إعلان مزيف',
  OFFENSIVE: 'محتوى مسيء',
  SPAM:      'إعلان مكرر أو غير مرغوب',
};

/** Must match the backend Prisma `AuditEventType` enum exactly (prisma/schema.prisma). */
export const AUDIT_EVENT_LABELS: Record<string, string> = {
  REGISTER:                   'تسجيل حساب جديد',
  LOGIN_SUCCESS:               'تسجيل دخول ناجح',
  LOGIN_FAILED:                 'محاولة تسجيل دخول فاشلة',
  LOGOUT:                       'تسجيل خروج',
  LOGOUT_ALL:                   'تسجيل خروج من كل الأجهزة',
  TOKEN_REFRESHED:              'تجديد الجلسة',
  TOKEN_REUSE_DETECTED:         'اكتشاف إعادة استخدام رمز',
  SESSION_REVOKED:              'إلغاء جلسة',
  ACCOUNT_LOCKED:               'قفل الحساب',
  PASSWORD_CHANGED:             'تغيير كلمة المرور',
  ROLE_CHANGED:                 'تغيير الدور',
  ACCOUNT_DISABLED:             'تعطيل الحساب',
  ADMIN_AD_FEATURED:            'تمييز إعلان (إدارة)',
  ADMIN_AD_PINNED:              'تثبيت إعلان (إدارة)',
  ADMIN_AD_DELETED:             'حذف إعلان (إدارة)',
  ADMIN_USER_STATUS_CHANGED:    'تغيير حالة مستخدم (إدارة)',
  ADMIN_SELLER_VERIFIED:        'توثيق بائع (إدارة)',
  ADMIN_SELLER_SUSPENDED:       'إيقاف بائع (إدارة)',
  ADMIN_STORE_STATUS_CHANGED:   'تغيير حالة متجر (إدارة)',
  OAUTH_LOGIN:                  'تسجيل دخول عبر OAuth',
  OAUTH_ACCOUNT_LINKED:         'ربط حساب OAuth',
  OAUTH_SIGNUP:                 'تسجيل حساب عبر OAuth',
};

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

/** Base URL for the backend API, consumed by api/client.ts */
export const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000') + '/api/v1';

/**
 * TanStack Query stale times — centralised so every hook uses
 * the same TTL values and they can be tuned in one place.
 */
export const CACHE_TTL = {
  adsList:     30_000,   //  30 s
  adDetail:    60_000,   //  60 s
  myAds:       30_000,   //  30 s
  categories:  300_000,  //   5 m
  userProfile: 120_000,  //   2 m
  sellerProfile: 60_000, //  60 s
  publicProfile: 120_000, //  2 m — matches userProfile's TTL for one's own profile
  sessions:    60_000,   //  60 s
  favorites:   60_000,   //  60 s
  adminList:   30_000,   //  30 s
  // Gap #7 (product analytics): aggregated over a date range, not a
  // live list — changes far less per-minute than adminList's paginated
  // tables, so a longer TTL avoids re-running the trend/category/funnel
  // aggregations on every sidebar revisit within the same session.
  adminAnalytics: 120_000, // 2 m
  // Epic 3.1: service requests move through PENDING/ACCEPTED/etc fairly
  // often (a provider can respond any time), so keep this shorter than
  // myAds — same reasoning as adsList's 30s over categories' 5m.
  serviceRequests: 20_000, // 20 s
  // Reviews are append-only and change far less often than a request's
  // live status — closer to sellerProfile's 60s than serviceRequests' 20s.
  serviceReviews: 60_000, // 60 s
  // Epic 4: a provider's own appointment list changes about as often as
  // their service requests (status flips on completion/cancellation) —
  // same 20s as serviceRequests. Availability is shorter: two customers
  // racing for the same slot need a fresher view, and the backend's own
  // race-protection (findOverlapping inside withProviderScheduleLock)
  // is the real source of truth at booking time regardless.
  appointments: 20_000,    // 20 s
  availability: 10_000,    // 10 s
  // Epic 5: polling-based (no WebSocket yet) — short enough that an
  // open thread feels responsive without hammering the API. Matches
  // this codebase's existing shortest TTLs (serviceRequests/appointments
  // at 20s) since a conversation is exactly as live as those.
  conversations: 20_000,   // 20 s
  messages: 5_000,         // 5 s — the actively-open thread polls faster
  // Epic 6: the unread count badge needs to feel live (a new message's
  // notification should show up on the bell without a full page
  // reload) but doesn't need messages' 5s aggressiveness — nobody is
  // staring at the bell waiting the way they stare at an open thread.
  notifications: 15_000,   // 15 s
  // A user's saved-search list changes only when they explicitly
  // create/delete one — no server-side process mutates it in the
  // background the way a conversation or notification does. Matches
  // categories' 5m as a "rarely changes, safe to cache long" TTL.
  savedSearches: 300_000,  // 5 m
  // Unified search: same volatility as adsList (its own results are a
  // superset that includes ads) — 30s keeps results fresh without
  // re-querying on every keystroke-triggered re-render.
  search: 30_000,          // 30 s
  // Suggestions change far less than search results (a new product
  // name only starts appearing once that product exists) and the
  // backend already caches this server-side for 5 minutes (see
  // search.service.ts's SUGGESTIONS_TTL) — a short client staleTime
  // just avoids re-fetching on every keystroke within the same debounce
  // window, the server-side cache absorbs the rest.
  searchSuggestions: 60_000, // 60 s
} as const;
