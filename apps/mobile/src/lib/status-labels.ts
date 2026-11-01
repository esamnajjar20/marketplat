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
