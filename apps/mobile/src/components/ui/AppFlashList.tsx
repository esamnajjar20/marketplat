/**
 * غلاف رفيع فوق FlashList (v2) يوحّد الإعدادات الافتراضية للقوائم الطويلة:
 * - drawDistance موحّد
 * - keyboardShouldPersistTaps="handled" (حقول البحث داخل الرأس لا تفقد التركيز)
 * - تتبّع نشاط التمرير تلقائيًا لتأجيل الأعمال الثانوية (انظر scrollActivity.ts)
 *
 * ملاحظات FlashList المهمة للمطوّرين:
 * - contentContainerStyle يدعم padding فقط: لا `gap` ولا `flexGrow`. استخدم
 *   ItemSeparatorComponent لفاصل العناصر، وهوامش داخل Header/Footer.
 * - لا يوجد getItemLayout/windowSize/initialNumToRender: التدوير يعتني بالباقي.
 * - إن تغيّر مظهر العنصر حسب نوعه استخدم getItemType حتى لا تُعاد تهيئة الخلايا.
 */
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import { FLASH_LIST_DRAW_DISTANCE } from '@/lib/listPerformance';
import { withScrollActivity } from '@/lib/scrollActivity';

export type AppFlashListProps<T> = FlashListProps<T>;

export function AppFlashList<T>(props: AppFlashListProps<T>) {
  const scrollHandlers = withScrollActivity(props);
  return (
    <FlashList<T>
      drawDistance={FLASH_LIST_DRAW_DISTANCE}
      keyboardShouldPersistTaps="handled"
      {...props}
      {...scrollHandlers}
    />
  );
}
