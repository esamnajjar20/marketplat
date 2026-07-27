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
  messages:      '/messages',
  dashboard:     '/dashboard',
  services:            '/services',
  serviceDetail:        (id: string) => `/services/${id}`,
  serviceProvider:       (id: string) => `/service-providers/${id}`,
  myServices:           '/my-services',
  myServiceCreate:      '/my-services/new',
  myServiceEdit:         (id: string) => `/my-services/${id}/edit`,
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
    root:       '/admin',
    dashboard:  '/admin/dashboard',
    ads:        '/admin/ads',
    users:      '/admin/users',
    reports:    '/admin/reports',
    categories: '/admin/categories',
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
} as const;
