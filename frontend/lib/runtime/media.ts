/**
 * اختيار صورة حسب البيئة.
 * Native → Capacitor Camera (كاميرا / معرض)
 * Browser / PWA → caller يفتح <input type="file"> (ImageUpload)
 */

import { isNativePlatform } from '@/lib/capacitor/platform';
import { takeOrPickNativePhoto } from '@/lib/capacitor/nativeCamera';

export async function canUseNativeImagePicker(): Promise<boolean> {
  return isNativePlatform();
}

/**
 * يفتح ورقة النظام لاختيار صورة. null = إلغاء أو غير مدعوم.
 * على الويب أعد null ليبقى مسار input type=file.
 */
export async function pickImageFile(): Promise<File | null> {
  if (!(await isNativePlatform())) return null;
  const result = await takeOrPickNativePhoto();
  return result?.file ?? null;
}
