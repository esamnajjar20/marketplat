/**
 * Arabic translations for every error `code` the backend can return
 * (see backend/src/shared/errors/errorCodes.ts — the two lists are meant
 * to be kept in sync 1:1).
 *
 * errorParser.ts looks a backend error up here by `code` first. The
 * English `message` string is never shown to the user and is only a
 * fallback for status-code branches when a request predates a specific
 * code being attached at some call site.
 *
 * Some entries are functions rather than plain strings: they need to
 * interpolate a value the backend sent in `meta` (e.g. the site's
 * ads-per-user limit) into the Arabic sentence, so the number itself
 * doesn't have to be duplicated/hardcoded on the frontend.
 */

export interface ErrorMeta {
  maxPerUser?: number;
  [key: string]: unknown;
}

import type { ErrorCodeValue } from '@/lib/errorCodes';

type ErrorMessageEntry = string | ((meta: ErrorMeta | undefined) => string);
type KnownErrorCode = ErrorCodeValue | 'NETWORK_ERROR' | 'OFFLINE_QUEUED' | 'QUEUE_STORE_FAILED' | 'QUEUE_BODY_TOO_LARGE';

export const errorMessages: Record<KnownErrorCode, ErrorMessageEntry> = {
  // ── Generic / fallback ──────────────────────────────────────────
  VALIDATION_ERROR: 'البيانات المرسلة غير صحيحة',
  BAD_REQUEST: 'تعذّر معالجة الطلب، تحقق من البيانات المدخلة',
  RESOURCE_NOT_FOUND: 'العنصر المطلوب غير موجود',
  UNAUTHORIZED: 'انتهت جلستك، يرجى تسجيل الدخول مجدداً',
  FORBIDDEN: 'لا تملك صلاحية لهذا الإجراء',
  RATE_LIMIT_EXCEEDED: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً',
  CONFLICT: 'يوجد تعارض في البيانات',
  INTERNAL_ERROR: 'خطأ في الخادم، يرجى المحاولة لاحقاً',
  SERVICE_UNAVAILABLE: 'الخدمة غير متاحة حالياً، يرجى المحاولة بعد قليل',
  // FIX SW-NETWORK-MSG-01: يصدره Service Worker عند فشل fetch وأونلاين
  // (ليس خطأ برمجي من الباك-إند). يجب ألا يُعرض كـ «خطأ في الخادم».
  NETWORK_ERROR:
    'تعذّر الوصول للخادم. تحقق من الاتصال أو حاول مجددًا بعد لحظات.',
  OFFLINE_QUEUED:
    'لا يوجد اتصال — سيُعاد إرسال العملية تلقائيًا عند عودة الاتصال.',
  QUEUE_STORE_FAILED: 'تعذّر حفظ العملية محليًا، حاول مرة أخرى.',
  QUEUE_BODY_TOO_LARGE: 'حجم العملية أكبر من الحد المسموح للحفظ المحلي.',
  // FIX SEC-3.4/5.9: matches error.middleware.ts's CODE_BY_STATUS[422]
  // fallback and errorParser.ts's existing `case 422` branch.
  UNPROCESSABLE_ENTITY: 'تعذّر معالجة الطلب، تحقق من صحة البيانات المدخلة',
  ALREADY_REVIEWED_STORE: 'لقد قيّمت هذا المتجر مسبقاً',
  CANNOT_BLOCK_SELF: 'لا يمكنك حظر حسابك الخاص',
  CANNOT_FOLLOW_OWN_STORE: 'لا يمكنك متابعة متجرك الخاص',
  CANNOT_RATE_OWN_STORE: 'لا يمكنك تقييم متجرك الخاص',
  CATEGORY_DEPTH_EXCEEDED: 'لا يمكن إضافة تصنيف بهذا العمق',
  CIRCULAR_CATEGORY_REFERENCE: 'لا يمكن ربط التصنيف بنفسه أو بأحد أبنائه',
  FRAUD_SIGNAL_NOT_FOUND: 'إشارة الاحتيال غير موجودة',
  IMAGES_MISMATCH: 'قائمة الصور لا تطابق الصور الحالية',
  PARENT_CATEGORY_NOT_FOUND: 'التصنيف الأب غير موجود',
  PRODUCT_CATEGORY_NOT_FOUND: 'تصنيف المنتج غير موجود',
  PRODUCT_LIMIT_REACHED: 'لقد وصلت إلى الحد الأقصى من المنتجات المسموح بها',
  PRODUCT_NOT_FOUND: 'المنتج غير موجود',
  RAPID_POSTING_BLOCKED: 'تم إيقاف النشر مؤقتاً بسبب كثرة العمليات، حاول لاحقاً',
  STORE_ALREADY_EXISTS: 'لديك متجر بالفعل',
  USER_BLOCKED: 'هذا المستخدم محظور',

  // ── Auth ─────────────────────────────────────────────────────────
  INVALID_CREDENTIALS: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  ACCOUNT_DEACTIVATED: 'تم إيقاف هذا الحساب، يرجى التواصل مع الدعم',
  ACCOUNT_LOCKED: 'تم قفل الحساب مؤقتاً بسبب محاولات دخول متكررة، حاول لاحقاً',
  TOO_MANY_ATTEMPTS_FROM_IP: 'محاولات كثيرة جداً، يرجى المحاولة لاحقاً',
  SESSION_EXPIRED: 'انتهت جلستك، يرجى تسجيل الدخول مجدداً',
  SESSION_NOT_FOUND: 'لم يتم العثور على الجلسة',
  EMAIL_ALREADY_EXISTS: 'البريد الإلكتروني مستخدم بالفعل',
  PHONE_ALREADY_EXISTS: 'رقم الهاتف مستخدم بالفعل',
  INVALID_RESET_TOKEN: 'رابط إعادة تعيين كلمة المرور غير صالح أو منتهي الصلاحية',
  CURRENT_PASSWORD_INVALID: 'كلمة المرور الحالية غير صحيحة',
  // FIX OAUTH-EMAIL-COLLISION-01: two new codes from loginWithGoogle's
  // collision guard. OAUTH_EMAIL_ALREADY_REGISTERED is the important
  // one — the user tried to sign in with Google first, and the app
  // needs to redirect them to the password flow without sounding like
  // an error (they haven't done anything wrong; another account simply
  // holds this email already).
  OAUTH_EMAIL_ALREADY_REGISTERED:
    'يوجد حساب مسجّل بهذا البريد مسبقًا. سجّل الدخول بكلمة المرور أولاً، ثم اربط Google من الإعدادات.',
  GOOGLE_ALREADY_LINKED_ELSEWHERE:
    'حساب Google هذا مرتبط بحساب سوق غزة آخر بالفعل.',
  GOOGLE_LINK_EMAIL_MISMATCH:
    'يجب أن يكون بريد Google هو نفس البريد المرتبط بحسابك في سوق غزة.',

  // ── Users ────────────────────────────────────────────────────────
  USER_NOT_FOUND: 'المستخدم غير موجود',
  NO_FILE_ATTACHED: 'لم يتم إرفاق أي ملف',

  // ── Admin ────────────────────────────────────────────────────────
  CANNOT_DEACTIVATE_SELF: 'لا يمكنك إيقاف حسابك الخاص',
  CANNOT_DEACTIVATE_LAST_ADMIN: 'لا يمكن إيقاف آخر مشرف نشط بالنظام',
  CANNOT_DEMOTE_SELF: 'لا يمكنك تخفيض صلاحيات حسابك الخاص',
  CANNOT_DEMOTE_LAST_ADMIN: 'لا يمكن تخفيض صلاحيات آخر مشرف نشط بالنظام',
  CONCURRENT_UPDATE_CONFLICT: 'حدث تعارض مع عملية أخرى، يرجى المحاولة مرة أخرى',

  // ── Stores ───────────────────────────────────────────────────────
  // FIX STORE-NOT-ACTIVE-I18N-01: backend's requireOwnStoreForProducts
  // (products.service.ts:75, and 6 other call sites across products /
  // promotions / collections) throws this exact code when the caller's
  // store is PENDING (awaiting admin approval) or BLOCKED. Without a
  // translation here, errorParser fell back to the generic FORBIDDEN
  // message ("لا تملك صلاحية لهذا الإجراء") — misleading, because the
  // user DOES own the store; it just isn't approved yet.
  STORE_NOT_ACTIVE:
    'متجرك قيد المراجعة — لا يمكنك نشر المنتجات حتى يوافق عليه الأدمن',
  STORE_NOT_FOUND:
    'لم يتم العثور على متجرك. افتح متجراً من الإعدادات أولاً.',
  STORE_BLOCKED:
    'تم إيقاف متجرك. تواصل مع الدعم لمعرفة السبب.',
  // Mirrors the backend's PRODUCT_IMAGE_REQUIRED at products.service.ts:82.
  PRODUCT_IMAGE_REQUIRED: 'يجب إضافة صورة واحدة على الأقل للمنتج',
  // Seller-ownership checks (both products.service.ts and stores.service.ts).
  NOT_YOUR_PRODUCT: 'هذا المنتج ليس ملكك',
  NOT_YOUR_STORE: 'هذا المتجر ليس ملكك',

  // ── Ads ──────────────────────────────────────────────────────────
  AD_NOT_FOUND: 'الإعلان غير موجود',
  AD_LIMIT_REACHED: (meta) =>
    meta?.maxPerUser
      ? `لقد وصلت للحد الأقصى من الإعلانات النشطة (${meta.maxPerUser}). يرجى حذف أو تحديد إعلان قديم كمباع لإضافة إعلان جديد.`
      : 'لقد وصلت للحد الأقصى من الإعلانات النشطة، يرجى حذف أو تحديد إعلان قديم كمباع لإضافة إعلان جديد',

  // ── Categories ───────────────────────────────────────────────────
  CATEGORY_NOT_FOUND: 'التصنيف غير موجود',

  // ── Uploads ──────────────────────────────────────────────────────
  FILE_TOO_LARGE: 'حجم الملف كبير جداً، الحد الأقصى 5 ميجابايت',
  INVALID_FILE_TYPE: 'نوع الملف غير مدعوم',
  REQUEST_TOO_LARGE: 'حجم الطلب كبير جداً',
  UNEXPECTED_FILE_FIELD: 'حقل ملف غير متوقع',
  TOO_MANY_FILES: 'الحد الأقصى 10 صور',
  TOO_MANY_FORM_FIELDS: 'عدد الحقول المرسلة أكبر من المسموح',

  MESSAGE_CONTENT_BLOCKED: 'تم حظر الرسالة: محتوى يطابق أنماط احتيال معروفة. أبقِ التفاوض داخل المنصة.',

  // ── Bookings / appointments ─────────────────────────────────────
  BOOKING_NOT_FOUND: 'الحجز غير موجود',
  TIME_SLOT_ALREADY_BOOKED: 'هذا الموعد محجوز بالفعل',
  APPOINTMENT_NOT_SCHEDULED: 'لا يمكن تغيير حالة موعد غير مجدول',
  NOT_YOUR_APPOINTMENT: 'هذا الموعد ليس لك',
  NOT_YOUR_SERVICE_REQUEST: 'هذا الطلب لا يخص خدماتك',

  // ── Ads — authorization ──────────────────────────────────────────
  NOT_YOUR_AD: 'هذا الإعلان ليس ملكك',
  CANNOT_SET_AD_STATUS: 'لا يمكنك تغيير حالة هذا الإعلان',

  // ── Images (ads / products / service listings) ───────────────────
  // FIX SEC-6.5/9.10: backend code existed at 3 call sites but had no
  // Arabic translation — fell through to the generic 400 fallback.
  MIN_IMAGES_REQUIRED: 'لا يمكن حذف الصورة الأخيرة، يجب أن يحتوي العنصر على صورة واحدة على الأقل. أضف صورة بديلة أولاً',
  // FIX BUG-IMG-REQ-01: was falling through to the generic
  // VALIDATION_ERROR message (no code attached on the backend) —
  // see ads.controller.ts's createAd.
  IMAGE_REQUIRED: 'أضف صورة واحدة على الأقل لنشر الإعلان',

  // ── Sellers ──────────────────────────────────────────────────────
  SELLER_PROFILE_ALREADY_EXISTS: 'لديك حساب بائع بالفعل',
  SELLER_SUSPENDED: 'تم إيقاف حساب البائع الخاص بك',
  SELLER_NOT_FOUND: 'البائع غير موجود',
  CANNOT_RATE_OWN_PROFILE: 'لا يمكنك تقييم حسابك الخاص',
  ALREADY_RATED: 'لقد قمت بتقييم هذه الصفقة مسبقاً',

  // ── Service listings ─────────────────────────────────────────────
  SERVICE_LISTING_NOT_FOUND: 'الخدمة غير موجودة',
  NOT_YOUR_SERVICE_LISTING: 'هذه الخدمة ليست ملكك',

  // ── Service providers ────────────────────────────────────────────
  SERVICE_PROVIDER_ALREADY_EXISTS: 'لديك حساب مزوّد خدمة بالفعل',
  SERVICE_PROVIDER_NOT_FOUND: 'مزوّد الخدمة غير موجود',

  // ── Service requests ──────────────────────────────────────────────
  SERVICE_REQUEST_NOT_FOUND: 'طلب الخدمة غير موجود',
  CANNOT_REQUEST_OWN_LISTING: 'لا يمكنك طلب خدمتك الخاصة',
  NOT_YOUR_SERVICE_REQUEST_ACTION: 'لا تملك صلاحية التصرف بهذا الطلب',
  SERVICE_REQUEST_CHANGED: 'تم تغيير حالة الطلب، يرجى تحديث الصفحة والمحاولة مجدداً',

  // ── Service reviews ───────────────────────────────────────────────
  NOT_YOUR_REQUEST_TO_REVIEW: 'يمكن للعميل صاحب الطلب فقط إضافة تقييم',
  ALREADY_REVIEWED: 'تم تقييم هذا الطلب مسبقاً',

  // ── Service categories ────────────────────────────────────────────
  SERVICE_CATEGORY_NOT_FOUND: 'تصنيف الخدمة غير موجود',
  // ── Complete backend code coverage ───────────────────────────────
  ADMIN_PINNED: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  AD_NOT_ACTIVE: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  AD_NOT_REPUBLISHABLE: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  AD_NO_IMAGES: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  AD_STILL_ACTIVE: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  AGREED_PRICE_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  ALREADY_MEMBER: 'هذه العملية أو البيانات موجودة بالفعل',
  ALREADY_STORE_OWNER: 'هذه العملية أو البيانات موجودة بالفعل',
  APPOINTMENTS_NOT_SUPPORTED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  ATTRIBUTE_FILTER_INVALID: 'البيانات أو العملية غير صالحة لهذا الطلب',
  ATTRIBUTE_FILTER_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  ATTRIBUTE_FILTER_SERVICE_TYPE_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  CANNOT_ASSIGN_SUPER_ADMIN: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية',
  CANNOT_CHANGE_OWN_ROLE: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية',
  CANNOT_DEACTIVATE_LAST_SUPER_ADMIN: 'هذا الحساب أو المورد غير متاح حالياً',
  CANNOT_FOLLOW_SELF: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية',
  CANNOT_INVITE_SELF: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية',
  CANNOT_MESSAGE_SELF: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية',
  CANNOT_OFFER_OWN_REQUEST: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية',
  CATEGORY_SERVICE_TYPE_LOCKED: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  COLLECTION_NOT_FOUND: 'العنصر المطلوب غير موجود',
  COLLECTION_SLUG_TAKEN: 'هذه العملية أو البيانات موجودة بالفعل',
  CONVERSATION_NOT_FOUND: 'العنصر المطلوب غير موجود',
  CORS_ORIGIN_REJECTED: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  CUSTOMER_APPOINTMENT_ACTION_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  CUSTOMER_NOT_FOUND: 'العنصر المطلوب غير موجود',
  CUSTOMER_PHONE_EXISTS: 'هذه العملية أو البيانات موجودة بالفعل',
  CUSTOMER_PRICE_APPROVAL_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  DEACTIVATE_NOT_PERMITTED: 'هذا الحساب أو المورد غير متاح حالياً',
  DEVICE_NOT_FOUND: 'العنصر المطلوب غير موجود',
  DISPUTE_CUSTOMER_ONLY: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية',
  DISPUTE_REASON_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  DISPUTE_WINDOW_EXPIRED: 'لا يمكن تنفيذ العملية في الوقت الحالي، يرجى المحاولة لاحقاً',
  DUPLICATE_INSTALLMENT_NO: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  DUPLICATE_POS_PRODUCT: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  DUPLICATE_SERVICE_REQUEST: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  EMAIL_ALREADY_VERIFIED: 'هذه العملية أو البيانات موجودة بالفعل',
  EMAIL_NOT_VERIFIED: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  FAVORITE_NOT_FOUND: 'العنصر المطلوب غير موجود',
  FIELD_SCOPE_IMMUTABLE: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  FOLLOW_BLOCKED: 'هذا الحساب أو المورد غير متاح حالياً',
  GOOGLE_OAUTH_NOT_CONFIGURED: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  GOOGLE_VERIFY_USER_NOT_FOUND: 'العنصر المطلوب غير موجود',
  INSTALLMENT_NOT_FOUND: 'العنصر المطلوب غير موجود',
  INSUFFICIENT_STOCK: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  INVALID_AUDIO_TYPE: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVALID_CATEGORY: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVALID_CATEGORY_TARGET: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVALID_DISCOUNT_PRICE: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVALID_DISCOUNT_VALUE: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVALID_INSTALLMENT_PAYMENT: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVALID_LIST_NAME: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVALID_MESSAGE_CONTEXT: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVALID_MESSAGE_CURSOR: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVALID_PROMOTION_WINDOW: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVALID_VERIFICATION_TOKEN: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVALID_WHOLESALE_PRICING: 'البيانات أو العملية غير صالحة لهذا الطلب',
  INVITE_NOT_FOUND: 'العنصر المطلوب غير موجود',
  INVITE_NOT_PENDING: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  INVITE_NOT_YOURS: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  LISTING_IMAGE_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  LIST_LIMIT: 'تم تجاوز الحد المسموح، يرجى المحاولة لاحقاً',
  LIST_NAME_EXISTS: 'هذه العملية أو البيانات موجودة بالفعل',
  LIST_NOT_FOUND: 'العنصر المطلوب غير موجود',
  MAX_OPEN_REQUESTS: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  MEMBER_NOT_FOUND: 'العنصر المطلوب غير موجود',
  MEMBER_REMOVED: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  MESSAGE_EMPTY: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  MESSAGE_MEDIA_NOT_FOUND: 'العنصر المطلوب غير موجود',
  MESSAGE_MEDIA_PROVIDER_UNSUPPORTED: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  MESSAGE_NOT_FOUND: 'العنصر المطلوب غير موجود',
  NOTIFICATION_NOT_FOUND: 'العنصر المطلوب غير موجود',
  NOT_A_SERVICE_PROVIDER: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  NOT_YOUR_COLLECTION: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  NOT_YOUR_CONVERSATION: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  NOT_YOUR_FAVORITE: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  NOT_YOUR_LIST: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  NOT_YOUR_MESSAGE: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  NOT_YOUR_OFFER: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  NOT_YOUR_PROMOTION: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  NOT_YOUR_REQUEST: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  NOT_YOUR_SERVICE: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  NO_IMAGES: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  NO_PASSWORD_SET: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  OAUTH_RESOLUTION_IN_PROGRESS: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  OFFER_NOT_FOUND: 'العنصر المطلوب غير موجود',
  OFFER_NOT_PENDING: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  OFFLINE_OPERATION_IN_FLIGHT: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  OFFLINE_OP_ID_CONFLICT: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  OUTSIDE_WORKING_HOURS: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  PAYMENTS_TOTAL_MISMATCH: 'البيانات أو العملية غير صالحة لهذا الطلب',
  PAYMENT_EXCEEDS_DUE: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  PAYMENT_EXCEEDS_INSTALLMENT: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  PAYMENT_EXCEEDS_TOTAL: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  POS_MULTI_STORE_NOT_SUPPORTED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  PRICE_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  PRICE_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  PRODUCT_CATEGORY_STORE_TYPE_MISMATCH: 'البيانات أو العملية غير صالحة لهذا الطلب',
  PRODUCT_CATEGORY_TYPE_CHANGE_HAS_PRODUCTS: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  PRODUCT_STORE_CHANGED: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  PROMOTION_ALREADY_LIVE: 'هذه العملية أو البيانات موجودة بالفعل',
  PROMOTION_NOT_FOUND: 'العنصر المطلوب غير موجود',
  PROVIDER_UNAVAILABLE: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  QUOTED_PRICE_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  QUOTED_PRICE_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  REFUND_EXCEEDS_SALE: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  REPUBLISH_COOLDOWN: 'لا يمكن تنفيذ العملية في الوقت الحالي، يرجى المحاولة لاحقاً',
  REPUBLISH_DAILY_LIMIT: 'تم تجاوز الحد المسموح، يرجى المحاولة لاحقاً',
  REPUBLISH_TOO_SOON: 'لا يمكن تنفيذ العملية في الوقت الحالي، يرجى المحاولة لاحقاً',
  REQUEST_ALREADY_ACCEPTED: 'هذه العملية أو البيانات موجودة بالفعل',
  REQUEST_ALREADY_SCHEDULED: 'هذه العملية أو البيانات موجودة بالفعل',
  REQUEST_EXPIRED: 'لا يمكن تنفيذ العملية في الوقت الحالي، يرجى المحاولة لاحقاً',
  REQUEST_NOT_FOUND: 'العنصر المطلوب غير موجود',
  REQUEST_NOT_OPEN: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  RETURN_ITEM_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  RETURN_QUANTITY_EXCEEDED: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  ROLE_CHANGE_NOT_PERMITTED: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية',
  SALE_ENTITY_ID_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  SALE_NOT_FOUND: 'العنصر المطلوب غير موجود',
  SAVED_SEARCH_LIMIT_REACHED: 'تم تجاوز الحد المسموح، يرجى المحاولة لاحقاً',
  SAVED_SEARCH_NOT_FOUND: 'العنصر المطلوب غير موجود',
  SELLER_ALREADY_VERIFIED: 'هذه العملية أو البيانات موجودة بالفعل',
  SERVICE_ATTRIBUTE_INVALID: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_ATTRIBUTE_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_ATTRIBUTE_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  SERVICE_AT_CUSTOMER_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_AT_PROVIDER_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_CITY_NOT_SUPPORTED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_LISTING_DELETED: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  SERVICE_LISTING_HAS_OPEN_REQUESTS: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  SERVICE_LOCATION_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_NOT_FOUND: 'العنصر المطلوب غير موجود',
  SERVICE_PRICING_TYPE_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_PROVIDER_SUSPENDED: 'هذا الحساب أو المورد غير متاح حالياً',
  SERVICE_REMOTE_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_REQUESTS_NOT_SUPPORTED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_REQUEST_MISMATCH: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_REQUEST_NOT_DISPUTED: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  SERVICE_TYPE_CAPABILITIES_INVALID: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_TYPE_CATEGORY_MISMATCH: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_TYPE_EXISTS: 'هذه العملية أو البيانات موجودة بالفعل',
  SERVICE_TYPE_FIELD_DEFINITION_INVALID: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_TYPE_FIELD_EXISTS: 'هذه العملية أو البيانات موجودة بالفعل',
  SERVICE_TYPE_FIELD_NOT_FOUND: 'العنصر المطلوب غير موجود',
  SERVICE_TYPE_INVALID: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_TYPE_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_TYPE_NOT_FOUND: 'العنصر المطلوب غير موجود',
  SERVICE_TYPE_NOT_IN_PROVIDER_CATALOG: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  SERVICE_TYPE_NOT_SUPPORTED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  SERVICE_TYPE_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  SERVICE_TYPE_SLUG_EXISTS: 'هذه العملية أو البيانات موجودة بالفعل',
  STORE_ACCESS_DENIED: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  STORE_AD_MISMATCH: 'البيانات أو العملية غير صالحة لهذا الطلب',
  STORE_MEMBER_LIMIT: 'تم تجاوز الحد المسموح، يرجى المحاولة لاحقاً',
  STORE_OWNER_ONLY: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  STORE_OWNER_SUSPENDED: 'هذا الحساب أو المورد غير متاح حالياً',
  STORE_PRODUCT_MISMATCH: 'البيانات أو العملية غير صالحة لهذا الطلب',
  STORE_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  STORE_ROLE_INSUFFICIENT: 'لا تملك الصلاحية لهذا الإجراء أو العنصر',
  STORE_TYPE_CHANGE_HAS_PRODUCTS: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  STORE_TYPE_CHANGE_NOT_ALLOWED: 'البيانات أو العملية غير صالحة لهذا الطلب',
  STORE_TYPE_FIELD_IN_USE: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  STORE_TYPE_FIELD_KEY_EXISTS: 'هذه العملية أو البيانات موجودة بالفعل',
  STORE_TYPE_FIELD_LIMIT: 'تم تجاوز الحد المسموح، يرجى المحاولة لاحقاً',
  STORE_TYPE_FIELD_NOT_FOUND: 'العنصر المطلوب غير موجود',
  STORE_TYPE_FIELD_OPTIONS_INVALID: 'البيانات أو العملية غير صالحة لهذا الطلب',
  STORE_TYPE_FIELD_OPTIONS_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  STORE_TYPE_FIELD_REQUIRED_DATA_MISSING: 'يرجى استكمال البيانات المطلوبة',
  STORE_TYPE_INACTIVE: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  STORE_TYPE_NOT_FOUND: 'العنصر المطلوب غير موجود',
  STORE_TYPE_SLUG_EXISTS: 'هذه العملية أو البيانات موجودة بالفعل',
  STORY_CONTENT_REQUIRED: 'يرجى استكمال البيانات المطلوبة',
  STORY_LIMIT_REACHED: 'تم تجاوز الحد المسموح، يرجى المحاولة لاحقاً',
  STORY_NOT_FOUND: 'العنصر المطلوب غير موجود',
  STORY_NOT_VISIBLE: 'تعذّر تنفيذ الطلب، يرجى المحاولة مرة أخرى',
  VERIFICATION_ALREADY_PENDING: 'هذه العملية أو البيانات موجودة بالفعل',

};

/**
 * Looks up the Arabic message for a backend error code, interpolating
 * `meta` where the entry needs it. Returns undefined for an unrecognised
 * code so callers can fall back to a status-code-based message.
 */
export function getErrorMessage(code: string | undefined, meta?: ErrorMeta): string | undefined {
  if (!code) return undefined;
  const entry = errorMessages[code as KnownErrorCode];
  if (!entry) return undefined;
  return typeof entry === 'function' ? entry(meta) : entry;
}
