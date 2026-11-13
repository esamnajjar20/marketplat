/**
 * إعدادات القوائم لتحسين السكرول.
 *
 * - القوائم الطويلة العمودية: استخدم `AppFlashList` (recycling حقيقي). FlashList
 *   لا يستعمل getItemLayout ولا windowSize، فلا تمرّر لها marketListPerf.
 * - FlatList يبقى للقوائم الصغيرة/الأفقية ثابتة الأبعاد (marketListPerf + getItemLayout).
 */
import { Platform, type FlatListProps } from 'react-native';

/** إعدادات افتراضية مناسبة لشاشات السوق على أجهزة متوسطة */
export const marketListPerf = {
  windowSize: 7,
  maxToRenderPerBatch: 8,
  initialNumToRender: 8,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: Platform.OS === 'ios',
} as const satisfies Partial<FlatListProps<unknown>>;

/** قوائم كثيفة (محادثات / نشاط) — نافذة أصغر */
export const denseListPerf = {
  windowSize: 5,
  maxToRenderPerBatch: 6,
  initialNumToRender: 6,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: Platform.OS === 'ios',
} as const satisfies Partial<FlatListProps<unknown>>;

/**
 * لا يوجد getItemLayout عام لبطاقات AdCard/CatalogCard عمدًا: ارتفاعها غير ثابت
 * (العنوان يلتف حتى سطرين + minHeight فقط)، وقيمة خاطئة تسبب قفزات في التمرير.
 * القوائم العمودية الطويلة تستعمل AppFlashList بدل ذلك.
 */

/** مسافة رسم مسبق لـ FlashList (px). قيمة أعلى = سلاسة أكثر وذاكرة أكبر. */
export const FLASH_LIST_DRAW_DISTANCE = 400;
