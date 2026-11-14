const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'نشط', PENDING: 'قيد الانتظار', OPEN: 'مفتوح', CLOSED: 'مغلق', EXPIRED: 'منتهي',
  COMPLETED: 'مكتمل', CANCELLED: 'ملغي', APPROVED: 'مقبول', REJECTED: 'مرفوض',
  IN_PROGRESS: 'قيد التنفيذ', ACCEPTED: 'مقبول', DISPUTED: 'قيد المراجعة', BLOCKED: 'محظور',
  PAUSED: 'متوقف مؤقتًا', DELETED: 'محذوف', REPORTED: 'تم الإبلاغ عنه', AVAILABLE: 'متاح',
  BUSY: 'مشغول', UNAVAILABLE: 'غير متاح', REMOVED: 'تمت الإزالة', SUSPENDED: 'موقوف',
  DRAFT: 'مسودة', PUBLISHED: 'منشور', ARCHIVED: 'مؤرشف', REQUIRES_ACTION: 'يتطلب إجراءً',
  MANAGER: 'مدير', STAFF: 'موظف', EDITOR: 'محرر', OWNER: 'مالك', CUSTOMER: 'عميل', PROVIDER: 'مقدم خدمة',
  CONFIRMED: 'مؤكد', RESCHEDULED: 'أعيدت جدولته', NO_SHOW: 'لم يحضر',
};
export function statusLabel(value?: string | null): string {
  if (!value) return 'غير محدد';
  return STATUS_LABELS[value.toUpperCase()] ?? value.replace(/_/g, ' ');
}
export function roleLabel(value?: string | null): string {
  if (!value) return 'عضو';
  return STATUS_LABELS[value.toUpperCase()] ?? value;
}

/**
 * Domain-aware label registry — single source of truth for every status / type
 * label shown in the app. A bare `statusLabel()` cannot know that "ACCEPTED"
 * means "offer accepted" on a request but "accepted" on a service request, so
 * each domain owns its wording here instead of re-declaring maps inside screens.
 */
export type LabelDomain =
  | 'ad' | 'adCondition' | 'product' | 'order' | 'serviceRequest' | 'appointment'
  | 'request' | 'offer' | 'installment' | 'paymentMethod' | 'report'
  | 'reportTarget' | 'reportReason' | 'storeMember' | 'saleEntity' | 'salePayment';

const DOMAIN_LABELS: Record<LabelDomain, Record<string, string>> = {
  ad: { ACTIVE: 'نشط', PENDING: 'قيد المراجعة', SOLD: 'مباع', EXPIRED: 'منتهي', REJECTED: 'مرفوض', SUSPENDED: 'موقوف', DELETED: 'محذوف' },
  adCondition: { NEW: 'جديد', USED: 'مستعمل', REFURBISHED: 'مجدّد' },
  product: {
    ACTIVE: 'نشط', DRAFT: 'مسودة', PENDING: 'قيد المراجعة', REJECTED: 'مرفوض', SUSPENDED: 'موقوف',
    IN_STOCK: 'متوفر', LIMITED: 'كمية محدودة', OUT_OF_STOCK: 'نفد المخزون',
  },
  order: {
    PENDING: 'بانتظار تأكيد المتجر', CONFIRMED: 'تم تأكيد الطلب', PROCESSING: 'قيد التجهيز',
    SHIPPED: 'تم الشحن', DELIVERED: 'تم التسليم', CANCELLED: 'ملغي',
  },
  serviceRequest: {
    PENDING: 'بانتظار الرد', ACCEPTED: 'مقبول', REJECTED: 'مرفوض', IN_PROGRESS: 'قيد التنفيذ',
    COMPLETED: 'مكتمل', CANCELLED: 'ملغي', EXPIRED: 'منتهي', DISPUTED: 'قيد المراجعة',
  },
  appointment: { SCHEDULED: 'مجدول', COMPLETED: 'مكتمل', CANCELLED: 'ملغى', NO_SHOW: 'لم يحضر' },
  request: { OPEN: 'مفتوح', ACCEPTED: 'تم قبول عرض', CANCELLED: 'ملغى', COMPLETED: 'مكتمل', EXPIRED: 'منتهي' },
  offer: { PENDING: 'بانتظار الرد', ACCEPTED: 'مقبول', REJECTED: 'مرفوض', WITHDRAWN: 'مسحوب' },
  installment: { PENDING: 'بانتظار الدفع', PAID: 'مدفوع', PARTIAL: 'مدفوع جزئيًا', OVERDUE: 'متأخر', CANCELLED: 'ملغى' },
  paymentMethod: {
    CASH: 'نقدًا', CASH_ON_DELIVERY: 'نقدًا عند الاستلام', CARD: 'بطاقة',
    BANK_TRANSFER: 'تحويل بنكي', WALLET: 'محفظة إلكترونية', OTHER: 'أخرى',
  },
  report: { PENDING: 'قيد المراجعة', RESOLVED: 'تم الحل', DISMISSED: 'تم الرفض' },
  // Both the API enum (AD…) and the route segment (ads…) are accepted so the
  // report form and "my reports" list can never drift apart.
  reportTarget: {
    AD: 'إعلان', USER: 'مستخدم', STORE: 'متجر', PRODUCT: 'منتج', SERVICE_LISTING: 'خدمة',
    ads: 'الإعلان', users: 'المستخدم', stores: 'المتجر', products: 'المنتج', services: 'الخدمة',
  },
  reportReason: { SCAM: 'احتيال', FAKE: 'محتوى مزيف', OFFENSIVE: 'محتوى مسيء', SPAM: 'محتوى مزعج' },
  storeMember: { ACTIVE: 'نشط', PENDING: 'بانتظار القبول', REMOVED: 'مزال' },
  saleEntity: { PRODUCT: 'منتج', AD: 'إعلان', SERVICE: 'خدمة', FREE: 'عنصر مجاني' },
  salePayment: { PAID: 'مدفوع بالكامل', PARTIAL: 'مدفوع جزئيًا', UNPAID: 'غير مدفوع', OVERDUE: 'متأخر' },
};

/**
 * Label for `value` inside `domain`. Unknown / empty values return `fallback`
 * (callers that previously echoed the raw value pass it as the fallback).
 */
export function domainLabel(domain: LabelDomain, value: string | null | undefined, fallback = 'غير محدد'): string {
  if (!value) return fallback;
  return DOMAIN_LABELS[domain][value] ?? fallback;
}
