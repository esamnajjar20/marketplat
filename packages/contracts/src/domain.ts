import { z } from 'zod';

/** Canonical primitive enums mirrored by Prisma. Parity is enforced in contracts tests. */
export const USER_ROLES = ['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'] as const;
export const ASSIGNABLE_USER_ROLES = ['USER', 'MODERATOR', 'ADMIN'] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export const assignableUserRoleSchema = z.enum(ASSIGNABLE_USER_ROLES);
export type UserRole = (typeof USER_ROLES)[number];
export type AssignableUserRole = (typeof ASSIGNABLE_USER_ROLES)[number];

export interface UserIdentityContract {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  needsProfileCompletion?: boolean;
  emailVerified?: boolean;
  city?: string | null;
  avatarUrl?: string | null;
}

export const REQUEST_TYPES = ['SERVICE', 'PRODUCT', 'RENTAL'] as const;
export const REQUEST_STATUSES = ['OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED'] as const;
export const REQUEST_OFFER_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'] as const;
export const AD_STATUSES = ['ACTIVE', 'SOLD', 'DELETED', 'EXPIRED'] as const;
export const AD_CONDITIONS = ['NEW', 'USED', 'REFURBISHED'] as const;
export const SERVICE_REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED'] as const;
export const APPOINTMENT_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export const MARKETPLACE_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
export const REPORT_STATUSES = ['PENDING', 'RESOLVED', 'DISMISSED'] as const;
export const STORE_MEMBER_STATUSES = ['PENDING', 'ACTIVE', 'REMOVED'] as const;
export const STORE_STATUSES = ['PENDING', 'ACTIVE', 'BLOCKED'] as const;
export const PROMOTION_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'CANCELLED'] as const;
export const PRODUCT_STATUSES = ['ACTIVE', 'PAUSED', 'DELETED'] as const;
export const SALE_PAYMENT_STATUSES = ['PAID', 'PARTIAL', 'UNPAID', 'OVERDUE'] as const;
export const INSTALLMENT_STATUSES = ['PENDING', 'PAID', 'OVERDUE', 'PARTIAL'] as const;
export const REPORT_REASONS = ['SCAM', 'FAKE', 'OFFENSIVE', 'SPAM'] as const;
export const REPORT_TARGET_TYPES = ['AD', 'USER', 'STORE', 'PRODUCT', 'SERVICE_LISTING'] as const;
export const STORE_MEMBER_ROLES = ['MANAGER', 'STAFF', 'EDITOR'] as const;
export const SERVICE_BUSINESS_TYPES = ['INDIVIDUAL', 'SMALL_BUSINESS'] as const;
export const SERVICE_AVAILABILITIES = ['AVAILABLE', 'BUSY', 'UNAVAILABLE'] as const;
export const SERVICE_PRICING_TYPES = ['FIXED', 'STARTING_FROM', 'NEGOTIABLE'] as const;
export const SERVICE_LISTING_STATUSES = ['ACTIVE', 'PAUSED', 'DELETED'] as const;
export const SERVICE_LOCATION_TYPES = ['AT_CUSTOMER', 'AT_PROVIDER', 'REMOTE'] as const;
export const SELLER_VERIFICATION_STATUSES = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] as const;
export const STORE_PLANS = ['FREE', 'FEATURED'] as const;
export const PRODUCT_AVAILABILITIES = ['IN_STOCK', 'LIMITED', 'OUT_OF_STOCK'] as const;
export const DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT'] as const;
export const SALE_ENTITY_TYPES = ['PRODUCT', 'AD', 'SERVICE', 'FREE'] as const;
export const SALE_TRANSFER_METHODS = ['CASH', 'JAWWAL_PAY', 'BANK_PALESTINE', 'PALPAY', 'CARD', 'OTHER'] as const;
export const RETURN_REASONS = ['DAMAGED', 'WRONG_ITEM', 'NOT_LIKED', 'LATE', 'OTHER'] as const;

export const FAVORITE_ENTITY_TYPES = ['AD', 'PRODUCT', 'SERVICE_LISTING', 'STORE'] as const;
export const STORE_FIELD_TYPES = ['TEXT', 'NUMBER', 'BOOLEAN', 'SELECT'] as const;
export const STORE_FIELD_SCOPES = ['STORE', 'PRODUCT'] as const;
export const STORY_VISIBILITIES = ['PUBLIC', 'FOLLOWERS'] as const;
export const FOLLOW_TARGET_TYPES = ['USER', 'STORE', 'CATEGORY'] as const;
export const USER_ACTIVITY_TYPES = ['AD_CREATED', 'AD_UPDATED', 'AD_DELETED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED', 'SERVICE_CREATED', 'SERVICE_UPDATED', 'SERVICE_DELETED', 'STORE_CREATED', 'STORE_UPDATED', 'FAVORITE_ADDED', 'FAVORITE_REMOVED', 'STORE_FOLLOWED', 'STORE_UNFOLLOWED', 'MESSAGE_SENT', 'SERVICE_REQUEST_CREATED', 'SERVICE_REQUEST_STATUS_CHANGED', 'APPOINTMENT_BOOKED', 'APPOINTMENT_CANCELLED', 'PROFILE_UPDATED', 'PASSWORD_CHANGED'] as const;
export const ACTIVITY_ENTITY_TYPES = ['AD', 'PRODUCT', 'SERVICE_LISTING', 'STORE', 'CONVERSATION', 'SERVICE_REQUEST', 'APPOINTMENT'] as const;
export const FRAUD_SIGNAL_TYPES = ['RAPID_POSTING', 'SUSPICIOUS_PRICE', 'SUSPICIOUS_CONTACT_PATTERN', 'SUSPICIOUS_KEYWORDS', 'DUPLICATE_LISTING', 'NEW_ACCOUNT_HIGH_ACTIVITY', 'MANUAL_ADMIN_FLAG'] as const;
export const SERVICE_TYPE_FIELD_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT'] as const;
export const SERVICE_TYPE_FIELD_SCOPES = ['LISTING', 'PROVIDER'] as const;
export const AUDIT_EVENT_TYPES = ['REGISTER', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'LOGOUT_ALL', 'TOKEN_REFRESHED', 'TOKEN_REUSE_DETECTED', 'SESSION_REVOKED', 'ACCOUNT_LOCKED', 'PASSWORD_CHANGED', 'ROLE_CHANGED', 'ACCOUNT_DISABLED', 'ADMIN_AD_FEATURED', 'ADMIN_AD_PINNED', 'ADMIN_AD_DELETED', 'ADMIN_USER_STATUS_CHANGED', 'ADMIN_SELLER_VERIFIED', 'ADMIN_SELLER_SUSPENDED', 'ADMIN_STORE_STATUS_CHANGED', 'ADMIN_STORE_PLAN_CHANGED', 'ADMIN_STORE_TYPE_CHANGED', 'OAUTH_LOGIN', 'EMAIL_VERIFIED', 'OAUTH_ACCOUNT_LINKED', 'OAUTH_SIGNUP', 'ADMIN_FRAUD_SIGNAL_REVIEWED', 'ADMIN_FRAUD_MANUAL_FLAG', 'ADMIN_SERVICE_BROADCAST_CANCELLED', 'ADMIN_DEVELOPER_TOOLS_CHANGED', 'ADMIN_OPEN_REQUEST_CANCELLED', 'STORE_MEMBER_INVITED', 'STORE_MEMBER_REMOVED'] as const;
export const ANALYTICS_EVENT_TYPES = ['PAGE_VIEW', 'AD_VIEW', 'SEARCH', 'CATEGORY_BROWSE', 'CONTACT_CLICK', 'SIGNUP_STARTED', 'SIGNUP_COMPLETED', 'PRODUCT_VIEW', 'SERVICE_VIEW'] as const;
export const SALES_AUTOMATION_EVENT_TYPES = ['LOW_STOCK', 'OVERDUE_DEBT', 'UPCOMING_INSTALLMENT', 'INACTIVE_CUSTOMER', 'DAILY_SUMMARY'] as const;

export const requestTypeSchema = z.enum(REQUEST_TYPES);
export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export const requestOfferStatusSchema = z.enum(REQUEST_OFFER_STATUSES);
export const adStatusSchema = z.enum(AD_STATUSES);
export const adConditionSchema = z.enum(AD_CONDITIONS);
export const serviceRequestStatusSchema = z.enum(SERVICE_REQUEST_STATUSES);
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export const marketplaceOrderStatusSchema = z.enum(MARKETPLACE_ORDER_STATUSES);
export const reportStatusSchema = z.enum(REPORT_STATUSES);
export const reportReasonSchema = z.enum(REPORT_REASONS);
export const reportTargetTypeSchema = z.enum(REPORT_TARGET_TYPES);
export const storeMemberStatusSchema = z.enum(STORE_MEMBER_STATUSES);
export const storeMemberRoleSchema = z.enum(STORE_MEMBER_ROLES);
export const storeStatusSchema = z.enum(STORE_STATUSES);
export const promotionStatusSchema = z.enum(PROMOTION_STATUSES);
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export const salePaymentStatusSchema = z.enum(SALE_PAYMENT_STATUSES);
export const installmentStatusSchema = z.enum(INSTALLMENT_STATUSES);
export const serviceBusinessTypeSchema = z.enum(SERVICE_BUSINESS_TYPES);
export const serviceAvailabilitySchema = z.enum(SERVICE_AVAILABILITIES);
export const servicePricingTypeSchema = z.enum(SERVICE_PRICING_TYPES);
export const serviceListingStatusSchema = z.enum(SERVICE_LISTING_STATUSES);
export const serviceLocationTypeSchema = z.enum(SERVICE_LOCATION_TYPES);
export const sellerVerificationStatusSchema = z.enum(SELLER_VERIFICATION_STATUSES);
export const storePlanSchema = z.enum(STORE_PLANS);
export const productAvailabilitySchema = z.enum(PRODUCT_AVAILABILITIES);
export const discountTypeSchema = z.enum(DISCOUNT_TYPES);
export const saleEntityTypeSchema = z.enum(SALE_ENTITY_TYPES);
export const saleTransferMethodSchema = z.enum(SALE_TRANSFER_METHODS);
export const returnReasonSchema = z.enum(RETURN_REASONS);

export const favoriteEntityTypeSchema = z.enum(FAVORITE_ENTITY_TYPES);
export const storeFieldTypeSchema = z.enum(STORE_FIELD_TYPES);
export const storeFieldScopeSchema = z.enum(STORE_FIELD_SCOPES);
export const storyVisibilitySchema = z.enum(STORY_VISIBILITIES);
export const followTargetTypeSchema = z.enum(FOLLOW_TARGET_TYPES);
export const userActivityTypeSchema = z.enum(USER_ACTIVITY_TYPES);
export const activityEntityTypeSchema = z.enum(ACTIVITY_ENTITY_TYPES);
export const fraudSignalTypeSchema = z.enum(FRAUD_SIGNAL_TYPES);
export const serviceTypeFieldTypeSchema = z.enum(SERVICE_TYPE_FIELD_TYPES);
export const serviceTypeFieldScopeSchema = z.enum(SERVICE_TYPE_FIELD_SCOPES);
export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
export const analyticsEventTypeSchema = z.enum(ANALYTICS_EVENT_TYPES);
export const salesAutomationEventTypeSchema = z.enum(SALES_AUTOMATION_EVENT_TYPES);

export type RequestType = (typeof REQUEST_TYPES)[number];
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export type RequestOfferStatus = (typeof REQUEST_OFFER_STATUSES)[number];
export type AdStatus = (typeof AD_STATUSES)[number];
export type AdCondition = (typeof AD_CONDITIONS)[number];
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export type MarketplaceOrderStatus = (typeof MARKETPLACE_ORDER_STATUSES)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type StoreMemberStatus = (typeof STORE_MEMBER_STATUSES)[number];
export type StoreStatus = (typeof STORE_STATUSES)[number];
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type SalePaymentStatus = (typeof SALE_PAYMENT_STATUSES)[number];
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
export type StoreMemberRole = (typeof STORE_MEMBER_ROLES)[number];
export type ServiceBusinessType = (typeof SERVICE_BUSINESS_TYPES)[number];
export type ServiceAvailability = (typeof SERVICE_AVAILABILITIES)[number];
export type ServicePricingType = (typeof SERVICE_PRICING_TYPES)[number];
export type ServiceListingStatus = (typeof SERVICE_LISTING_STATUSES)[number];
export type ServiceLocationType = (typeof SERVICE_LOCATION_TYPES)[number];
export type SellerVerificationStatus = (typeof SELLER_VERIFICATION_STATUSES)[number];
export type StorePlan = (typeof STORE_PLANS)[number];
export type ProductAvailability = (typeof PRODUCT_AVAILABILITIES)[number];
export type DiscountType = (typeof DISCOUNT_TYPES)[number];
export type SaleEntityType = (typeof SALE_ENTITY_TYPES)[number];
export type SaleTransferMethod = (typeof SALE_TRANSFER_METHODS)[number];
export type ReturnReason = (typeof RETURN_REASONS)[number];

export type FavoriteEntityType = (typeof FAVORITE_ENTITY_TYPES)[number];
export type StoreFieldType = (typeof STORE_FIELD_TYPES)[number];
export type StoreFieldScope = (typeof STORE_FIELD_SCOPES)[number];
export type StoryVisibility = (typeof STORY_VISIBILITIES)[number];
export type FollowTargetType = (typeof FOLLOW_TARGET_TYPES)[number];
export type UserActivityType = (typeof USER_ACTIVITY_TYPES)[number];
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];
export type FraudSignalType = (typeof FRAUD_SIGNAL_TYPES)[number];
export type ServiceTypeFieldType = (typeof SERVICE_TYPE_FIELD_TYPES)[number];
export type ServiceTypeFieldScope = (typeof SERVICE_TYPE_FIELD_SCOPES)[number];
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];
export type SalesAutomationEventType = (typeof SALES_AUTOMATION_EVENT_TYPES)[number];

export interface RequestOfferContract {
  id: string;
  requestId: string;
  offererUserId: string;
  price: string | number;
  message: string | null;
  status: RequestOfferStatus;
  createdAt: string;
}

export interface RequestSummaryContract {
  id: string;
  type: RequestType;
  title: string;
  status: RequestStatus;
  city?: string | null;
}

/** Unscoped fallback labels for legacy UI surfaces that do not know the entity domain. Prefer DOMAIN_STATUS_LABELS when the domain is known. */
export const GENERIC_STATUS_LABELS = {
  ACTIVE: 'نشط', PENDING: 'قيد الانتظار', OPEN: 'مفتوح', CLOSED: 'مغلق', EXPIRED: 'منتهي',
  COMPLETED: 'مكتمل', CANCELLED: 'ملغي', APPROVED: 'مقبول', REJECTED: 'مرفوض',
  IN_PROGRESS: 'قيد التنفيذ', ACCEPTED: 'مقبول', DISPUTED: 'قيد المراجعة', BLOCKED: 'محظور',
  PAUSED: 'متوقف مؤقتًا', DELETED: 'محذوف', REPORTED: 'تم الإبلاغ عنه', AVAILABLE: 'متاح',
  BUSY: 'مشغول', UNAVAILABLE: 'غير متاح', REMOVED: 'تمت الإزالة', SUSPENDED: 'موقوف',
  DRAFT: 'مسودة', PUBLISHED: 'منشور', ARCHIVED: 'مؤرشف', REQUIRES_ACTION: 'يتطلب إجراءً',
  CONFIRMED: 'مؤكد', RESCHEDULED: 'أعيدت جدولته',
} as const;

/** Domain-specific wording is shared; unknown future enum values stay explicit at call sites. */
export const DOMAIN_STATUS_LABELS = {
  role: {
    USER: 'مستخدم', MODERATOR: 'مشرف مساعد', ADMIN: 'مدير', SUPER_ADMIN: 'مدير أعلى',
    MANAGER: 'مدير', STAFF: 'موظف', EDITOR: 'محرر منتجات', OWNER: 'مالك', CUSTOMER: 'عميل', PROVIDER: 'مقدم خدمة',
  },
  ad: { ACTIVE: 'نشط', PENDING: 'قيد المراجعة', SOLD: 'تم البيع', EXPIRED: 'منتهي', REJECTED: 'مرفوض', SUSPENDED: 'موقوف', DELETED: 'محذوف' },
  adCondition: { NEW: 'جديد', USED: 'مستعمل', REFURBISHED: 'مجدّد' },
  product: { ACTIVE: 'نشط', DRAFT: 'مسودة', PENDING: 'قيد المراجعة', REJECTED: 'مرفوض', SUSPENDED: 'موقوف', IN_STOCK: 'متوفر', LIMITED: 'كمية محدودة', OUT_OF_STOCK: 'نفد المخزون', PAUSED: 'متوقف مؤقتًا', DELETED: 'محذوف' },
  order: { PENDING: 'بانتظار تأكيد المتجر', CONFIRMED: 'تم تأكيد الطلب', PROCESSING: 'قيد التجهيز', SHIPPED: 'تم الشحن', DELIVERED: 'تم التسليم', CANCELLED: 'ملغي' },
  serviceRequest: { PENDING: 'قيد الانتظار', ACCEPTED: 'مقبول', REJECTED: 'مرفوض', IN_PROGRESS: 'قيد التنفيذ', COMPLETED: 'مكتمل', CANCELLED: 'ملغى', EXPIRED: 'منتهي تلقائيًا', DISPUTED: 'قيد النزاع' },
  appointment: { SCHEDULED: 'محجوز', COMPLETED: 'مكتمل', CANCELLED: 'ملغى', NO_SHOW: 'لم يحضر' },
  request: { OPEN: 'مفتوح', ACCEPTED: 'مقبول', CANCELLED: 'ملغى', EXPIRED: 'منتهي' },
  requestType: { SERVICE: 'خدمة', PRODUCT: 'منتج', RENTAL: 'إيجار' },
  offer: { PENDING: 'قيد الانتظار', ACCEPTED: 'مقبول', DECLINED: 'مرفوض', WITHDRAWN: 'مسحوب' },
  installment: { PENDING: 'بانتظار الدفع', PAID: 'مدفوع', PARTIAL: 'مدفوع جزئيًا', OVERDUE: 'متأخر', CANCELLED: 'ملغى' },
  report: { PENDING: 'قيد المراجعة', RESOLVED: 'تم الحل', DISMISSED: 'تم الرفض' },
  reportTarget: { AD: 'إعلان', USER: 'مستخدم', STORE: 'متجر', PRODUCT: 'منتج', SERVICE_LISTING: 'خدمة', ads: 'الإعلان', users: 'المستخدم', stores: 'المتجر', products: 'المنتج', services: 'الخدمة' },
  reportReason: { SCAM: 'عملية احتيال', FAKE: 'محتوى وهمي أو مزيف', OFFENSIVE: 'محتوى مسيء', SPAM: 'رسائل مزعجة (سبام)' },
  reportTargetType: { AD: 'إعلان', USER: 'مستخدم', STORE: 'متجر', PRODUCT: 'منتج', SERVICE_LISTING: 'خدمة' },
  storeMemberRole: { MANAGER: 'مدير', STAFF: 'موظف', EDITOR: 'محرر منتجات' },
  serviceAvailability: { AVAILABLE: 'متاح', BUSY: 'مشغول', UNAVAILABLE: 'غير متاح' },
  serviceBusinessType: { INDIVIDUAL: 'فرد', SMALL_BUSINESS: 'شركة صغيرة' },
  serviceListing: { ACTIVE: 'نشط', PAUSED: 'متوقف مؤقتًا', DELETED: 'محذوف' },
  servicePricing: { FIXED: 'سعر ثابت', STARTING_FROM: 'يبدأ من', NEGOTIABLE: 'حسب الاتفاق' },
  serviceLocation: { AT_CUSTOMER: 'عند العميل', AT_PROVIDER: 'عند مقدم الخدمة', REMOTE: 'عن بُعد' },
  sellerVerification: { UNVERIFIED: 'غير موثق', PENDING: 'قيد المراجعة', VERIFIED: 'موثق', REJECTED: 'مرفوض' },
  storePlan: { FREE: 'مجاني', FEATURED: 'مميز' },
  productAvailability: { IN_STOCK: 'متوفر', LIMITED: 'كمية محدودة', OUT_OF_STOCK: 'نفد المخزون' },
  discountType: { PERCENTAGE: 'نسبة مئوية (%)', FIXED_AMOUNT: 'مبلغ ثابت' },
  returnReason: { DAMAGED: 'تالف', WRONG_ITEM: 'منتج غير صحيح', NOT_LIKED: 'غير مرغوب', LATE: 'تأخر', OTHER: 'أخرى' },
  storeMember: { ACTIVE: 'نشط', PENDING: 'بانتظار القبول', REMOVED: 'مزال' },
  store: { PENDING: 'قيد المراجعة', ACTIVE: 'نشط', BLOCKED: 'محظور' },
  promotion: { DRAFT: 'مسودة', SCHEDULED: 'مجدول', ACTIVE: 'نشط', EXPIRED: 'منتهي', CANCELLED: 'ملغي' },
  saleEntity: { PRODUCT: 'منتج', AD: 'إعلان', SERVICE: 'خدمة', FREE: 'عنصر مجاني' },
  salePayment: { PAID: 'مدفوع بالكامل', PARTIAL: 'مدفوع جزئيًا', UNPAID: 'غير مدفوع', OVERDUE: 'متأخر' },
  fraudSignal: {
    RAPID_POSTING: 'نشر متسارع', SUSPICIOUS_PRICE: 'سعر مشبوه', SUSPICIOUS_CONTACT_PATTERN: 'نمط تواصل مشبوه',
    SUSPICIOUS_KEYWORDS: 'كلمات مشبوهة', DUPLICATE_LISTING: 'إعلان مكرر',
    NEW_ACCOUNT_HIGH_ACTIVITY: 'حساب جديد بنشاط مرتفع', MANUAL_ADMIN_FLAG: 'علامة يدوية من الإدارة',
  },
  auditEvent: {
    REGISTER: 'تسجيل حساب جديد', LOGIN_SUCCESS: 'تسجيل دخول ناجح', LOGIN_FAILED: 'محاولة تسجيل دخول فاشلة',
    LOGOUT: 'تسجيل خروج', LOGOUT_ALL: 'تسجيل خروج من كل الأجهزة', TOKEN_REFRESHED: 'تجديد الجلسة',
    TOKEN_REUSE_DETECTED: 'اكتشاف إعادة استخدام رمز', SESSION_REVOKED: 'إلغاء جلسة', ACCOUNT_LOCKED: 'قفل الحساب',
    PASSWORD_CHANGED: 'تغيير كلمة المرور', ROLE_CHANGED: 'تغيير الدور', ACCOUNT_DISABLED: 'تعطيل الحساب',
    ADMIN_AD_FEATURED: 'تمييز إعلان (إدارة)', ADMIN_AD_PINNED: 'تثبيت إعلان (إدارة)', ADMIN_AD_DELETED: 'حذف إعلان (إدارة)',
    ADMIN_USER_STATUS_CHANGED: 'تغيير حالة مستخدم (إدارة)', ADMIN_SELLER_VERIFIED: 'توثيق بائع (إدارة)',
    ADMIN_SELLER_SUSPENDED: 'إيقاف بائع (إدارة)', ADMIN_STORE_STATUS_CHANGED: 'تغيير حالة متجر (إدارة)',
    ADMIN_STORE_PLAN_CHANGED: 'تغيير خطة متجر (إدارة)', ADMIN_STORE_TYPE_CHANGED: 'تغيير نوع متجر (إدارة)',
    OAUTH_LOGIN: 'تسجيل دخول عبر OAuth', EMAIL_VERIFIED: 'تأكيد البريد الإلكتروني',
    OAUTH_ACCOUNT_LINKED: 'ربط حساب OAuth', OAUTH_SIGNUP: 'تسجيل حساب عبر OAuth',
    ADMIN_FRAUD_SIGNAL_REVIEWED: 'مراجعة إشارة احتيال (إدارة)', ADMIN_FRAUD_MANUAL_FLAG: 'وضع علامة احتيال يدوية (إدارة)',
    ADMIN_SERVICE_BROADCAST_CANCELLED: 'إلغاء إشعار خدمة جماعي', ADMIN_DEVELOPER_TOOLS_CHANGED: 'تغيير أدوات المطور',
    ADMIN_OPEN_REQUEST_CANCELLED: 'إلغاء طلب مفتوح (إدارة)', STORE_MEMBER_INVITED: 'دعوة عضو متجر', STORE_MEMBER_REMOVED: 'إزالة عضو متجر',
  },
  paymentMethod: { CASH: 'نقدًا', CASH_ON_DELIVERY: 'نقدًا عند الاستلام', CARD: 'بطاقة', BANK_TRANSFER: 'تحويل بنكي', WALLET: 'محفظة إلكترونية', JAWWAL_PAY: 'جوال باي', BANK_PALESTINE: 'بنك فلسطين', PALPAY: 'بال باي', OTHER: 'أخرى' },
} as const satisfies Record<string, Record<string, string>>;

export type StatusLabelDomain = keyof typeof DOMAIN_STATUS_LABELS;
export function domainStatusLabel(
  domain: StatusLabelDomain,
  value: string | null | undefined,
  fallback = 'غير محدد',
): string {
  if (!value) return fallback;
  return DOMAIN_STATUS_LABELS[domain][value as keyof (typeof DOMAIN_STATUS_LABELS)[typeof domain]] ?? fallback;
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  USER: DOMAIN_STATUS_LABELS.role.USER,
  MODERATOR: DOMAIN_STATUS_LABELS.role.MODERATOR,
  ADMIN: DOMAIN_STATUS_LABELS.role.ADMIN,
  SUPER_ADMIN: DOMAIN_STATUS_LABELS.role.SUPER_ADMIN,
};
