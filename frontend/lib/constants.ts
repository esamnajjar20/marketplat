import type { AdSortField, AdSortOrder } from '@/types/ad.types';

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
  adEdit:        (id: string)   => `/ads/${id}/edit`,
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

export const AD_SORT_OPTIONS: readonly { label: string; sortBy: AdSortField; sortOrder: AdSortOrder }[] = [
  { label: 'الأحدث',       sortBy: 'createdAt', sortOrder: 'desc' },
  { label: 'الأقدم',       sortBy: 'createdAt', sortOrder: 'asc'  },
  { label: 'السعر (أقل)',   sortBy: 'price',     sortOrder: 'asc'  },
  { label: 'السعر (أعلى)', sortBy: 'price',     sortOrder: 'desc' },
  { label: 'الأكثر مشاهدة', sortBy: 'views',    sortOrder: 'desc' },
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
} as const;
