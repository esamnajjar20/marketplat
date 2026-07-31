/**
 * FIX I18N-01: Arabic translation for backend (Zod) field-level
 * validation messages.
 *
 * Until this fix, `errorParser.ts`'s `parseFieldErrors` passed Zod's
 * raw English `issue.message` straight through to the UI — both the
 * custom messages authored in each *.validation.ts (e.g. "Title must
 * be at least 3 characters") and, for fields with no custom message
 * (e.g. `city: z.string().min(2).max(100)`), Zod's own built-in
 * English default ("String must contain at least 2 character(s)").
 * Neither ever went through the errors.ts `code` dictionary, because
 * that dictionary only ever covered the top-level `code` (VALIDATION_
 * ERROR etc.), not individual field issues.
 *
 * error.middleware.ts now also sends `errorMeta`: for every field, the
 * same issues as `errors` but as the Zod issue's own structured
 * `{ code, params }` (ZodIssueCode + whatever numeric/string detail
 * that issue type carries — minimum/maximum/type/validation/options/
 * etc.) instead of pre-rendered English prose. translateFieldIssue()
 * builds a real Arabic sentence from that structure, so it covers
 * every field, custom message or not, and doesn't silently stop
 * working the next time someone rewords a message in a *.validation.ts
 * file — the previous approach's exact failure mode for `city`.
 *
 * A fixed literal-string table is kept as a fallback for the (rare)
 * case where `errorMeta` is absent for some reason — e.g. an older
 * cached response shape — so a field error still renders in Arabic
 * rather than falling through to raw English.
 */

/** Friendly Arabic label for a field name, used to build sentences like "العنوان يجب أن يتكون من 3 أحرف على الأقل". */
const FIELD_LABELS: Record<string, string> = {
  title: 'العنوان',
  description: 'الوصف',
  details: 'التفاصيل',
  price: 'السعر',
  city: 'المدينة',
  name: 'الاسم',
  nameAr: 'الاسم بالعربية',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  newPassword: 'كلمة المرور الجديدة',
  currentPassword: 'كلمة المرور الحالية',
  phone: 'رقم الهاتف',
  contactPhone: 'رقم التواصل',
  bio: 'النبذة التعريفية',
  displayName: 'اسم العرض',
  businessName: 'اسم النشاط التجاري',
  comment: 'التعليق',
  notes: 'الملاحظات',
  slug: 'الرابط المختصر',
  categoryId: 'التصنيف',
  listingId: 'الخدمة',
  requestId: 'الطلب',
  score: 'التقييم',
  reason: 'السبب',
  status: 'الحالة',
  token: 'الرمز',
  avatarUrl: 'رابط الصورة الشخصية',
  logoUrl: 'رابط الشعار',
  serviceAreaCities: 'مدن تقديم الخدمة',
  workingHours: 'ساعات العمل',
  agreedToSellerTerms: 'الموافقة على شروط البائع',
  q: 'كلمة البحث',
  search: 'كلمة البحث',
  id: 'المعرّف',
  adId: 'الإعلان',
  general: 'البيانات المدخلة',
};

function fieldLabel(field: string): string {
  // Nested/indexed paths ("workingHours.sun.open") fall back to their
  // last segment so an unmapped nested field still gets a reasonable
  // label instead of the raw dotted path.
  return FIELD_LABELS[field] ?? FIELD_LABELS[field.split('.').pop() ?? field] ?? 'هذا الحقل';
}

export interface FieldIssueMeta {
  code: string;
  params?: Record<string, unknown>;
}

/**
 * Builds an Arabic sentence for one Zod issue from its structured
 * { code, params }. Covers every ZodIssueCode this codebase's schemas
 * actually produce (string/number min-max, regex, url, email, enum,
 * literal, type mismatch, refine/custom) generically, so a field with
 * no custom message translates just as well as one that has one.
 */
export function translateFieldIssue(field: string, issue: FieldIssueMeta): string {
  const label = fieldLabel(field);
  const p = issue.params ?? {};

  switch (issue.code) {
    case 'too_small': {
      const min = p.minimum as number | string | undefined;
      if (p.type === 'string') {
        return min === 1
          ? `${label} مطلوب`
          : `${label} يجب أن يتكون من ${min} أحرف على الأقل`;
      }
      if (p.type === 'array') {
        return `${label}: يجب اختيار ${min} على الأقل`;
      }
      if (p.type === 'number') {
        return p.exclusive
          ? `${label} يجب أن يكون أكبر من ${min}`
          : `${label} يجب ألا يقل عن ${min}`;
      }
      return `${label} أقل من الحد المسموح`;
    }
    case 'too_big': {
      const max = p.maximum as number | string | undefined;
      if (p.type === 'string') {
        return `${label} يجب ألا يتجاوز ${max} حرفاً`;
      }
      if (p.type === 'array') {
        return `${label}: الحد الأقصى ${max}`;
      }
      if (p.type === 'number') {
        return p.exclusive
          ? `${label} يجب أن يكون أقل من ${max}`
          : `${label} يجب ألا يتجاوز ${max}`;
      }
      return `${label} أكبر من الحد المسموح`;
    }
    case 'invalid_string': {
      if (p.validation === 'email') return `صيغة ${label} غير صحيحة`;
      if (p.validation === 'url') return `${label} يجب أن يكون رابطاً صحيحاً`;
      return `صيغة ${label} غير صحيحة`;
    }
    case 'invalid_type': {
      if (p.received === 'undefined') return `${label} مطلوب`;
      return `${label} غير صالح`;
    }
    case 'invalid_enum_value':
    case 'invalid_literal':
      return `قيمة ${label} غير صالحة`;
    case 'not_multiple_of':
      return `${label} غير صالح (عدد المنازل العشرية غير مسموح)`;
    case 'custom':
    default:
      return `${label} غير صالح`;
  }
}

/**
 * Fallback literal-string table for the exact custom English messages
 * authored across backend/src/modules/*.validation.ts, used only when
 * `errorMeta` structure isn't available for a given issue (older
 * response shape) and translateFieldIssue() above can't run. Kept
 * intentionally small — this is a safety net, not the primary path.
 */
const LITERAL_FALLBACKS: Record<string, string> = {
  'Invalid email format': 'صيغة البريد الإلكتروني غير صحيحة',
  'Invalid phone number': 'رقم الهاتف غير صحيح',
  'Password is required': 'كلمة المرور مطلوبة',
  'Current password is required': 'كلمة المرور الحالية مطلوبة',
  'Reset token is required': 'رمز إعادة التعيين مطلوب',
  'Search query is required': 'كلمة البحث مطلوبة',
  'You must agree to the seller terms.': 'يجب الموافقة على شروط البائع',
  'At least one preference must be provided': 'يجب تحديد تفضيل واحد على الأقل',
  'scheduledEnd must be after scheduledStart': 'وقت الانتهاء يجب أن يكون بعد وقت البداية',
  'scheduledStart must be in the future': 'وقت الموعد يجب أن يكون في المستقبل',
  'date must be YYYY-MM-DD': 'صيغة التاريخ غير صحيحة',
};

/** Best-effort Arabic translation for a raw backend field message, used only as a last resort. */
export function translateLiteralFallback(message: string): string {
  return LITERAL_FALLBACKS[message] ?? 'البيانات المدخلة غير صحيحة';
}
