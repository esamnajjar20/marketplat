/**
 * PERF-BUNDLE-QUEUE-EVENT-01 — حدث "أُضيف عنصر للطابور" في ملف صغير مستقل.
 *
 * كان الثابت يُعرَّف داخل hooks/useQueuedRequestCount.ts، وذلك الملف يستورد
 * lib/offlineQueue.ts (~33 KB مصدر). api/client.ts يستورد الثابت فقط، فصار
 * كل route يحمّل offlineQueue بالكامل عبر
 * AppProviders → AuthHydrationProvider → api/client.ts رغم أنه لا يُستعمل
 * إلا في مسار فشل الشبكة. الثابت هنا بلا أي اعتماديات؛ الـ hook يعيد تصديره
 * فتبقى كل الاستيرادات القديمة صالحة.
 */
export const QUEUE_UPDATED_EVENT = 'offline-queue:queued';
