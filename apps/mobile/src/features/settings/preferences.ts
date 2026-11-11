/**
 * تفضيلات الإشعارات — تطابق عقد الـ API (`updateNotificationPreferencesSchema`)
 * ونموذج الويب `NotificationSettingsForm.tsx` مفتاحًا بمفتاح.
 */
export type Preferences = Record<string, boolean | string>;

export const DEFAULT_PREFS: Preferences = {
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
};

/** نفس احتياطي الخادم في `pushService.resolveQuietTimeZone`. */
export const DEFAULT_QUIET_TIME_ZONE = 'Asia/Gaza';

export type PreferenceGroup = {
  title: string;
  description: string;
  items: { key: string; label: string; desc: string }[];
};

export const PREFERENCE_GROUPS: PreferenceGroup[] = [
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
    items: [
      { key: 'serviceQuotes', label: 'عروض أسعار الخدمات', desc: 'عند وصول طلب خدمة أو تغيّر حالته أو حجز موعد، وعند استلام عرض أو قبوله' },
    ],
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
];

export function getDeviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** صيغة 24 ساعة `HH:mm` (00:00–23:59). */
export function validTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}
