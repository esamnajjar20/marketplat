/**
 * نصوص التحميل الموحّدة — مصدر واحد بدل «جارٍ» / «جاري» المتفرّقة.
 * استخدمها في aria-label ونصوص الأزرار ومؤشرات التحميل.
 */
export const LOADING_COPY = {
  default: 'جارٍ التحميل…',
  page: 'جارٍ فتح الصفحة…',
  navigating: 'جارٍ الانتقال بين الصفحات',
  navigationStalled: 'تأخر فتح الصفحة. يمكنك إعادة المحاولة.',
  refreshing: 'جارٍ التحديث…',
  loadingMore: 'جارٍ تحميل المزيد…',
  saving: 'جارٍ الحفظ…',
  sending: 'جارٍ الإرسال…',
  deleting: 'جارٍ الحذف…',
  uploading: 'جارٍ الرفع…',
  searching: 'جارٍ البحث…',
} as const;

export type LoadingCopyKey = keyof typeof LOADING_COPY;
