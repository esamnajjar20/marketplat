import { z } from 'zod';

/** Canonical notification vocabulary shared by API, web and native clients.
 * Keep in parity with prisma/schema.prisma's NotificationType enum. */
export const NOTIFICATION_TYPES = [
  'SALES_OVERDUE_DEBT',
  'SALES_UPCOMING_INSTALLMENT',
  'SALES_LOW_STOCK',
  'SALES_INACTIVE_CUSTOMER',
  'SALES_DAILY_SUMMARY',
  'SALES_SMART_INSIGHT',
  'NEW_MESSAGE',
  'NEW_FOLLOWER',
  'FOLLOWED_USER_ACTIVITY',
  'FOLLOWED_STORE_ACTIVITY',
  'FOLLOWED_CATEGORY_ACTIVITY',
  'FAV_AD_PRICE_CHANGED',
  'FAV_AD_SOLD',
  'PROMOTION',
  'WEEKLY_AD_VIEWS_REPORT',
  'WEEKLY_STORE_VIEWS_REPORT',
  'WEEKLY_SERVICE_VIEWS_REPORT',
  'SAVED_SEARCH_MATCH',
  'STORE_NEW_PRODUCT',
  'PROMOTION_STATUS_CHANGE',
  'STORE_PROMOTION_STARTED',
  'STORE_PRODUCT_RESTOCKED',
  'NEW_SERVICE_QUOTE',
  'SERVICE_QUOTE_ACCEPTED',
  'NEW_REQUEST_OFFER',
  'REQUEST_OFFER_ACCEPTED',
  'STORE_MEMBER_INVITED',
  'SERVICE_REQUEST_NEW',
  'SERVICE_REQUEST_UPDATE',
  'APPOINTMENT_UPDATE',
  'MARKETPLACE_ORDER_NEW',
  'MARKETPLACE_ORDER_UPDATE',
  'AD_EXPIRING_SOON',
  'AD_EXPIRED',
  'MODERATION_REPORT_RECEIVED',
  'MODERATION_DECISION',
  'SALES_DAILY_REMINDER',
  'SALES_OVERDUE_INSTALLMENT',
  'SALES_DEBT_REMINDER',
  'SALES_WEEKLY_REPORT',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);

export const NOTIFICATION_CATEGORY_IDS = [
  'messages',
  'favorites',
  'stores',
  'services',
  'orders',
  'following',
  'system',
  'sales',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORY_IDS)[number];
export const notificationCategorySchema = z.enum(NOTIFICATION_CATEGORY_IDS);

/** A partition of all notification types used by both web and mobile filters. */
export const NOTIFICATION_CATEGORY_TYPES = {
  messages: ['NEW_MESSAGE'],
  favorites: ['FAV_AD_PRICE_CHANGED', 'FAV_AD_SOLD', 'SAVED_SEARCH_MATCH'],
  stores: [
    'STORE_NEW_PRODUCT',
    'PROMOTION_STATUS_CHANGE',
    'STORE_PROMOTION_STARTED',
    'STORE_PRODUCT_RESTOCKED',
    'STORE_MEMBER_INVITED',
  ],
  services: [
    'NEW_SERVICE_QUOTE',
    'SERVICE_QUOTE_ACCEPTED',
    'NEW_REQUEST_OFFER',
    'REQUEST_OFFER_ACCEPTED',
    'SERVICE_REQUEST_NEW',
    'SERVICE_REQUEST_UPDATE',
    'APPOINTMENT_UPDATE',
  ],
  orders: ['MARKETPLACE_ORDER_NEW', 'MARKETPLACE_ORDER_UPDATE'],
  following: [
    'NEW_FOLLOWER',
    'FOLLOWED_USER_ACTIVITY',
    'FOLLOWED_STORE_ACTIVITY',
    'FOLLOWED_CATEGORY_ACTIVITY',
  ],
  system: [
    'PROMOTION',
    'WEEKLY_AD_VIEWS_REPORT',
    'WEEKLY_STORE_VIEWS_REPORT',
    'WEEKLY_SERVICE_VIEWS_REPORT',
    'AD_EXPIRING_SOON',
    'AD_EXPIRED',
    'MODERATION_REPORT_RECEIVED',
    'MODERATION_DECISION',
  ],
  sales: [
    'SALES_OVERDUE_DEBT',
    'SALES_UPCOMING_INSTALLMENT',
    'SALES_LOW_STOCK',
    'SALES_INACTIVE_CUSTOMER',
    'SALES_DAILY_SUMMARY',
    'SALES_SMART_INSIGHT',
    'SALES_DAILY_REMINDER',
    'SALES_OVERDUE_INSTALLMENT',
    'SALES_DEBT_REMINDER',
    'SALES_WEEKLY_REPORT',
  ],
} as const satisfies Record<NotificationCategory, readonly NotificationType[]>;

export const NOTIFICATION_CATEGORIES: ReadonlyArray<{
  id: 'all' | NotificationCategory;
  label: string;
  types: readonly NotificationType[] | null;
}> = [
  { id: 'all', label: 'الكل', types: null },
  { id: 'messages', label: 'رسائل', types: NOTIFICATION_CATEGORY_TYPES.messages },
  { id: 'favorites', label: 'مفضلة وبحث', types: NOTIFICATION_CATEGORY_TYPES.favorites },
  { id: 'stores', label: 'متاجر', types: NOTIFICATION_CATEGORY_TYPES.stores },
  { id: 'services', label: 'خدمات', types: NOTIFICATION_CATEGORY_TYPES.services },
  { id: 'orders', label: 'طلبات المنتجات', types: NOTIFICATION_CATEGORY_TYPES.orders },
  { id: 'following', label: 'المتابعة', types: NOTIFICATION_CATEGORY_TYPES.following },
  { id: 'system', label: 'النظام', types: NOTIFICATION_CATEGORY_TYPES.system },
  { id: 'sales', label: 'المبيعات', types: NOTIFICATION_CATEGORY_TYPES.sales },
];

export type NotificationIconKey =
  | 'message'
  | 'user'
  | 'following'
  | 'tag'
  | 'megaphone'
  | 'chart'
  | 'search'
  | 'store'
  | 'package'
  | 'clipboard'
  | 'service'
  | 'calendar'
  | 'shield'
  | 'wallet';

export const NOTIFICATION_TYPE_META: Record<NotificationType, {
  category: NotificationCategory;
  label: string;
  icon: NotificationIconKey;
}> = {
  SALES_OVERDUE_DEBT: { category: 'sales', label: 'دين متأخر', icon: 'wallet' },
  SALES_UPCOMING_INSTALLMENT: { category: 'sales', label: 'قسط قادم', icon: 'wallet' },
  SALES_LOW_STOCK: { category: 'sales', label: 'مخزون منخفض', icon: 'package' },
  SALES_INACTIVE_CUSTOMER: { category: 'sales', label: 'عميل غير نشط', icon: 'wallet' },
  SALES_DAILY_SUMMARY: { category: 'sales', label: 'ملخص المبيعات اليومي', icon: 'chart' },
  SALES_SMART_INSIGHT: { category: 'sales', label: 'رؤية ذكية للمبيعات', icon: 'chart' },
  NEW_MESSAGE: { category: 'messages', label: 'رسائل', icon: 'message' },
  NEW_FOLLOWER: { category: 'following', label: 'متابع جديد', icon: 'user' },
  FOLLOWED_USER_ACTIVITY: { category: 'following', label: 'نشاط شخص تتابعه', icon: 'following' },
  FOLLOWED_STORE_ACTIVITY: { category: 'following', label: 'نشاط متجر تتابعه', icon: 'following' },
  FOLLOWED_CATEGORY_ACTIVITY: { category: 'following', label: 'نشاط فئة تتابعها', icon: 'following' },
  FAV_AD_PRICE_CHANGED: { category: 'favorites', label: 'تغيير سعر', icon: 'tag' },
  FAV_AD_SOLD: { category: 'favorites', label: 'تم البيع', icon: 'tag' },
  PROMOTION: { category: 'system', label: 'ترويج المنصة', icon: 'megaphone' },
  WEEKLY_AD_VIEWS_REPORT: { category: 'system', label: 'تقرير مشاهدات إعلان', icon: 'chart' },
  WEEKLY_STORE_VIEWS_REPORT: { category: 'system', label: 'تقرير مشاهدات متجر', icon: 'chart' },
  WEEKLY_SERVICE_VIEWS_REPORT: { category: 'system', label: 'تقرير مشاهدات خدمة', icon: 'chart' },
  SAVED_SEARCH_MATCH: { category: 'favorites', label: 'بحث محفوظ', icon: 'search' },
  STORE_NEW_PRODUCT: { category: 'stores', label: 'منتج جديد', icon: 'store' },
  PROMOTION_STATUS_CHANGE: { category: 'stores', label: 'حالة عرضك', icon: 'megaphone' },
  STORE_PROMOTION_STARTED: { category: 'stores', label: 'عرض متجر', icon: 'megaphone' },
  STORE_PRODUCT_RESTOCKED: { category: 'stores', label: 'عودة للمخزون', icon: 'package' },
  NEW_SERVICE_QUOTE: { category: 'services', label: 'عرض سعر خدمة', icon: 'service' },
  SERVICE_QUOTE_ACCEPTED: { category: 'services', label: 'قبول عرض خدمة', icon: 'service' },
  NEW_REQUEST_OFFER: { category: 'services', label: 'عرض جديد على طلبك', icon: 'clipboard' },
  REQUEST_OFFER_ACCEPTED: { category: 'services', label: 'تم قبول عرضك', icon: 'clipboard' },
  STORE_MEMBER_INVITED: { category: 'stores', label: 'دعوة متجر', icon: 'user' },
  SERVICE_REQUEST_NEW: { category: 'services', label: 'طلب خدمة جديد', icon: 'service' },
  SERVICE_REQUEST_UPDATE: { category: 'services', label: 'تحديث طلب خدمة', icon: 'service' },
  APPOINTMENT_UPDATE: { category: 'services', label: 'موعد', icon: 'calendar' },
  MARKETPLACE_ORDER_NEW: { category: 'orders', label: 'طلب شراء جديد', icon: 'clipboard' },
  MARKETPLACE_ORDER_UPDATE: { category: 'orders', label: 'تحديث طلب شراء', icon: 'clipboard' },
  AD_EXPIRING_SOON: { category: 'system', label: 'إعلان يقترب من الانتهاء', icon: 'calendar' },
  AD_EXPIRED: { category: 'system', label: 'انتهاء إعلان', icon: 'calendar' },
  MODERATION_REPORT_RECEIVED: { category: 'system', label: 'بلاغ جديد', icon: 'shield' },
  MODERATION_DECISION: { category: 'system', label: 'نتيجة المراجعة', icon: 'shield' },
  SALES_DAILY_REMINDER: { category: 'sales', label: 'تذكير المبيعات', icon: 'wallet' },
  SALES_OVERDUE_INSTALLMENT: { category: 'sales', label: 'قسط متأخر', icon: 'wallet' },
  SALES_DEBT_REMINDER: { category: 'sales', label: 'تذكير دين', icon: 'wallet' },
  SALES_WEEKLY_REPORT: { category: 'sales', label: 'تقرير المبيعات', icon: 'chart' },
};

export interface NotificationData {
  /** Notification payloads are extensible; retain unmodeled fields from older/newer producers. */
  [key: string]: unknown;
  conversationId?: string;
  followerId?: string;
  adId?: string;
  savedSearchId?: string;
  promotionId?: string;
  productId?: string;
  storeId?: string;
  listingId?: string;
  serviceId?: string;
  appointmentId?: string;
  broadcastId?: string;
  quoteId?: string;
  requestId?: string;
  orderId?: string;
  offerId?: string;
  status?: string;
  memberId?: string;
  event?: string;
  reportId?: string;
  targetType?: string;
  targetId?: string;
  saleId?: string;
  installmentId?: string;
  customerId?: string;
  digest?: boolean;
  counts?: Record<string, number>;
  url?: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData | null;
  readAt: string | null;
  createdAt: string;
}

/** Provider-neutral payload shared by the BullMQ/inline and durable push adapters. */
export interface NotificationPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  image?: string;
  urgent?: boolean;
  type?: string;
  bypassQuietHours?: boolean;
}

export const notificationPushPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  url: z.string().max(2048).optional(),
  tag: z.string().max(128).optional(),
  image: z.string().max(2048).optional(),
  urgent: z.boolean().optional(),
  type: z.string().max(80).optional(),
  bypassQuietHours: z.boolean().optional(),
});

/** Logical target shared between clients; each platform maps it to its routes. */
export type NotificationTargetKind =
  | 'conversation' | 'profile' | 'following_feed' | 'ad' | 'product' | 'service'
  | 'store' | 'saved_searches' | 'store_members' | 'request' | 'service_request'
  | 'appointments' | 'order' | 'orders' | 'sale' | 'installments' | 'debts'
  | 'sales' | 'store_promotions' | 'dashboard' | 'store_analytics' | 'service_analytics'
  | 'reports' | 'home' | 'favorites' | 'notifications';

export interface NotificationTarget {
  kind: NotificationTargetKind;
  id?: string;
}

function nonEmptyId(data: NotificationData | null | undefined, key: keyof NotificationData): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Resolves notification payload to a platform-neutral destination. */
export function resolveNotificationTarget(
  type: NotificationType | string,
  data: NotificationData | null | undefined
): NotificationTarget {
  const conversationId = nonEmptyId(data, 'conversationId');
  if (conversationId) return { kind: 'conversation', id: conversationId };

  const adId = nonEmptyId(data, 'adId');
  const productId = nonEmptyId(data, 'productId');
  const storeId = nonEmptyId(data, 'storeId');
  const listingId = nonEmptyId(data, 'listingId');
  const serviceId = nonEmptyId(data, 'serviceId');
  const requestId = nonEmptyId(data, 'requestId');
  const followerId = nonEmptyId(data, 'followerId');
  const savedSearchId = nonEmptyId(data, 'savedSearchId');
  const orderId = nonEmptyId(data, 'orderId');
  const saleId = nonEmptyId(data, 'saleId');

  if (type === 'NEW_MESSAGE') return { kind: 'conversation' };
  if (type === 'NEW_FOLLOWER') return { kind: 'profile', id: followerId };
  if (type === 'FOLLOWED_USER_ACTIVITY' || type === 'FOLLOWED_STORE_ACTIVITY' || type === 'FOLLOWED_CATEGORY_ACTIVITY') {
    return { kind: 'following_feed' };
  }
  if (type === 'FAV_AD_PRICE_CHANGED' || type === 'FAV_AD_SOLD' || type === 'AD_EXPIRING_SOON' || type === 'AD_EXPIRED') {
    return adId ? { kind: 'ad', id: adId } : { kind: 'favorites' };
  }
  if (type === 'SAVED_SEARCH_MATCH') {
    if (adId) return { kind: 'ad', id: adId };
    if (productId) return { kind: 'product', id: productId };
    if (serviceId || listingId) return { kind: 'service', id: serviceId ?? listingId };
    return savedSearchId ? { kind: 'saved_searches', id: savedSearchId } : { kind: 'saved_searches' };
  }
  if (type === 'STORE_NEW_PRODUCT') {
    if (productId) return { kind: 'product', id: productId };
    return storeId ? { kind: 'store', id: storeId } : { kind: 'store' };
  }
  if (type === 'STORE_PROMOTION_STARTED' || type === 'STORE_PRODUCT_RESTOCKED') {
    if (productId) return { kind: 'product', id: productId };
    return storeId ? { kind: 'store', id: storeId } : { kind: 'store' };
  }
  if (type === 'PROMOTION_STATUS_CHANGE') return { kind: 'store_promotions' };
  if (type === 'STORE_MEMBER_INVITED') return { kind: 'store_members' };
  if (type === 'NEW_REQUEST_OFFER' || type === 'REQUEST_OFFER_ACCEPTED') {
    return requestId ? { kind: 'request', id: requestId } : { kind: 'request' };
  }
  if (type === 'NEW_SERVICE_QUOTE' || type === 'SERVICE_QUOTE_ACCEPTED') {
    return serviceId || listingId ? { kind: 'service', id: serviceId ?? listingId } : { kind: 'notifications' };
  }
  if (type === 'SERVICE_REQUEST_NEW' || type === 'SERVICE_REQUEST_UPDATE') {
    return requestId ? { kind: 'service_request', id: requestId } : { kind: 'notifications' };
  }
  if (type === 'APPOINTMENT_UPDATE') {
    return requestId ? { kind: 'service_request', id: requestId } : { kind: 'appointments' };
  }
  if (type === 'MARKETPLACE_ORDER_NEW' || type === 'MARKETPLACE_ORDER_UPDATE') {
    return orderId ? { kind: 'order', id: orderId } : { kind: 'orders' };
  }
  if (type === 'PROMOTION') return { kind: 'home' };
  if (type === 'WEEKLY_AD_VIEWS_REPORT') return { kind: 'dashboard' };
  if (type === 'WEEKLY_STORE_VIEWS_REPORT') return { kind: 'store_analytics' };
  if (type === 'WEEKLY_SERVICE_VIEWS_REPORT') return { kind: 'service_analytics' };
  if (type === 'MODERATION_REPORT_RECEIVED' || type === 'MODERATION_DECISION') return { kind: 'reports' };
  if (type === 'SALES_UPCOMING_INSTALLMENT' || type === 'SALES_OVERDUE_INSTALLMENT') return { kind: 'installments' };
  if (type === 'SALES_OVERDUE_DEBT' || type === 'SALES_DEBT_REMINDER') return { kind: 'debts' };
  if (type.startsWith('SALES_')) {
    if (saleId) return { kind: 'sale', id: saleId };
    if (productId) return { kind: 'product', id: productId };
    return { kind: 'sales' };
  }
  return { kind: 'notifications' };
}

export const NOTIFICATION_CONTENT_PREFERENCE_KEYS = [
  'newMessage', 'adViews', 'favAdUpdated', 'promotions', 'myPromotions', 'savedSearch',
  'storeUpdates', 'followUpdates', 'serviceQuotes', 'salesAlerts', 'lowStockAlerts',
  'installmentAlerts', 'debtAlerts', 'weeklySalesReport',
] as const;
export type NotificationContentPreferenceKey = (typeof NOTIFICATION_CONTENT_PREFERENCE_KEYS)[number];

export const NOTIFICATION_PREFERENCE_DEFAULTS = {
  newMessage: true,
  adViews: false,
  favAdUpdated: true,
  promotions: false,
  myPromotions: true,
  savedSearch: true,
  storeUpdates: true,
  followUpdates: true,
  serviceQuotes: true,
  salesAlerts: true,
  lowStockAlerts: true,
  installmentAlerts: true,
  debtAlerts: true,
  weeklySalesReport: true,
  emailFallback: false,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  quietHoursAllowUrgent: true,
} as const;

export type NotificationPreferences = {
  [K in NotificationContentPreferenceKey]: boolean;
} & {
  emailFallback?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  quietHoursAllowUrgent?: boolean;
  quietHoursTimeZone?: string;
};

export const NOTIFICATION_PREFERENCE_GROUPS = [
  {
    title: 'التواصل',
    description: 'رسائل ومحادثات المشترين',
    items: [{ key: 'newMessage', label: 'رسائل جديدة', desc: 'عند استلام رسالة من مشتري أو بائع' }],
  },
  {
    title: 'المفضلة والبحث',
    description: 'تحديثات ما تتابعه',
    items: [
      { key: 'favAdUpdated', label: 'تحديثات المفضلة', desc: 'عند تغيير سعر إعلان في المفضلة أو بيعه' },
      { key: 'savedSearch', label: 'البحث المحفوظ', desc: 'عند ظهور إعلان أو منتج أو خدمة تطابق بحثك' },
    ],
  },
  {
    title: 'المتاجر والعروض',
    description: 'متاجر تتابعها وعروضك أنت',
    items: [
      { key: 'storeUpdates', label: 'تحديثات المتاجر', desc: 'منتجات وعروض وإعادة توفّر من متاجر تتابعها' },
      { key: 'followUpdates', label: 'تحديثات المتابعة', desc: 'عندما يبدأ شخص بمتابعتك أو ينشر شخص/متجر/فئة تتابعها محتوى جديدًا' },
      { key: 'myPromotions', label: 'عروضي', desc: 'عند بدء أو قرب انتهاء أو انتهاء عرض على أحد منتجاتك' },
      { key: 'promotions', label: 'عروض وتخفيضات المنصة', desc: 'نشرة أخبار وعروض المنصة' },
    ],
  },
  {
    title: 'الخدمات',
    description: 'عروض الأسعار وطلبات الخدمة',
    items: [{ key: 'serviceQuotes', label: 'عروض أسعار الخدمات', desc: 'عند وصول طلب خدمة أو تغيّر حالته أو حجز موعد، وعند استلام عرض أو قبوله' }],
  },
  {
    title: 'المبيعات والمخزون',
    description: 'تنبيهات تساعدك على متابعة نشاطك التجاري',
    items: [
      { key: 'salesAlerts', label: 'تذكير المبيعات', desc: 'تذكير إذا لم تسجل مبيعات في اليوم' },
      { key: 'lowStockAlerts', label: 'انخفاض المخزون', desc: 'عند وصول مخزون منتج إلى حد منخفض' },
      { key: 'installmentAlerts', label: 'الأقساط المتأخرة', desc: 'عند تأخر قسط على عميل' },
      { key: 'debtAlerts', label: 'الديون', desc: 'عند استمرار دين العميل لفترة طويلة' },
      { key: 'weeklySalesReport', label: 'تقرير المبيعات الأسبوعي', desc: 'ملخص أسبوعي للمبيعات والإيرادات' },
    ],
  },
  {
    title: 'تقارير البائع',
    description: 'إحصائيات دورية',
    items: [{ key: 'adViews', label: 'مشاهدات الإعلان', desc: 'تقرير أسبوعي بمشاهدات إعلاناتك' }],
  },
] as const satisfies ReadonlyArray<{
  title: string;
  description: string;
  items: ReadonlyArray<{ key: NotificationContentPreferenceKey; label: string; desc: string }>;
}>;

/** Legacy JSON may contain string booleans. Parse only explicit values; never Boolean("false"). */
export function readNotificationPreference(
  raw: unknown,
  key: NotificationContentPreferenceKey
): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NOTIFICATION_PREFERENCE_DEFAULTS[key];
  const value = (raw as Record<string, unknown>)[key];
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return NOTIFICATION_PREFERENCE_DEFAULTS[key];
}

const quietHoursTimeSchema = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm').optional();
export const notificationPreferencesPatchSchema = z.object({
  newMessage: z.boolean().optional(),
  adViews: z.boolean().optional(),
  favAdUpdated: z.boolean().optional(),
  promotions: z.boolean().optional(),
  myPromotions: z.boolean().optional(),
  savedSearch: z.boolean().optional(),
  storeUpdates: z.boolean().optional(),
  followUpdates: z.boolean().optional(),
  serviceQuotes: z.boolean().optional(),
  salesAlerts: z.boolean().optional(),
  lowStockAlerts: z.boolean().optional(),
  installmentAlerts: z.boolean().optional(),
  debtAlerts: z.boolean().optional(),
  weeklySalesReport: z.boolean().optional(),
  emailFallback: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: quietHoursTimeSchema,
  quietHoursEnd: quietHoursTimeSchema,
  quietHoursAllowUrgent: z.boolean().optional(),
  quietHoursTimeZone: z.string().max(64).refine(tz => {
    try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; }
    catch { return false; }
  }, 'Invalid time zone').optional(),
}).refine(value => Object.keys(value).length > 0, {
  message: 'At least one preference must be provided',
});

export type NotificationPreferencesPatch = z.infer<typeof notificationPreferencesPatchSchema>;
