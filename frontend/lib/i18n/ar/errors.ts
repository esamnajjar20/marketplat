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

type ErrorMessageEntry = string | ((meta: ErrorMeta | undefined) => string);

export const errorMessages: Record<string, ErrorMessageEntry> = {
  // ── Generic / fallback ──────────────────────────────────────────
  VALIDATION_ERROR: 'البيانات المرسلة غير صحيحة',
  RESOURCE_NOT_FOUND: 'العنصر المطلوب غير موجود',
  UNAUTHORIZED: 'انتهت جلستك، يرجى تسجيل الدخول مجدداً',
  FORBIDDEN: 'لا تملك صلاحية لهذا الإجراء',
  RATE_LIMIT_EXCEEDED: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً',
  CONFLICT: 'يوجد تعارض في البيانات',
  INTERNAL_ERROR: 'خطأ في الخادم، يرجى المحاولة لاحقاً',
  SERVICE_UNAVAILABLE: 'الخدمة غير متاحة حالياً، يرجى المحاولة بعد قليل',

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

  // ── Users ────────────────────────────────────────────────────────
  USER_NOT_FOUND: 'المستخدم غير موجود',
  NO_FILE_ATTACHED: 'لم يتم إرفاق أي ملف',

  // ── Admin ────────────────────────────────────────────────────────
  CANNOT_DEACTIVATE_SELF: 'لا يمكنك إيقاف حسابك الخاص',
  CANNOT_DEACTIVATE_LAST_ADMIN: 'لا يمكن إيقاف آخر مشرف نشط بالنظام',
  CANNOT_DEMOTE_SELF: 'لا يمكنك تخفيض صلاحيات حسابك الخاص',
  CANNOT_DEMOTE_LAST_ADMIN: 'لا يمكن تخفيض صلاحيات آخر مشرف نشط بالنظام',
  CONCURRENT_UPDATE_CONFLICT: 'حدث تعارض مع عملية أخرى، يرجى المحاولة مرة أخرى',

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

  // ── Bookings / appointments ─────────────────────────────────────
  BOOKING_NOT_FOUND: 'الحجز غير موجود',
  TIME_SLOT_ALREADY_BOOKED: 'هذا الموعد محجوز بالفعل',
  APPOINTMENT_NOT_SCHEDULED: 'لا يمكن تغيير حالة موعد غير مجدول',
  NOT_YOUR_APPOINTMENT: 'هذا الموعد ليس لك',
  NOT_YOUR_SERVICE_REQUEST: 'هذا الطلب لا يخص خدماتك',

  // ── Ads — authorization ──────────────────────────────────────────
  NOT_YOUR_AD: 'هذا الإعلان ليس ملكك',
  CANNOT_SET_AD_STATUS: 'لا يمكنك تغيير حالة هذا الإعلان',

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
};

/**
 * Looks up the Arabic message for a backend error code, interpolating
 * `meta` where the entry needs it. Returns undefined for an unrecognised
 * code so callers can fall back to a status-code-based message.
 */
export function getErrorMessage(code: string | undefined, meta?: ErrorMeta): string | undefined {
  if (!code) return undefined;
  const entry = errorMessages[code];
  if (!entry) return undefined;
  return typeof entry === 'function' ? entry(meta) : entry;
}
