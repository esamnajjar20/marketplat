/**
 * PUSH-OPTOUT-01: اختيار المستخدم الصريح «أوقف إشعارات هذا الجهاز».
 *
 * إذن النظام (granted) ≠ رغبة المستخدم. ensurePushSubscriptionSynced /
 * ensureNativePushSynced تعيدان الاشتراك تلقائيًا عند كل تحميل للتطبيق ما دام
 * الإذن ممنوحًا، فكان زر «إيقاف» يُلغى بصمت. هذا العلم يُحفظ لكل مستخدم على
 * هذا الجهاز، ولا يُمسح عند الخروج (الخروج ليس تغييرًا للرغبة).
 *
 * المفتاح مرتبط بـ userId حتى لا يرث حساب آخر على نفس الجهاز اختيار غيره.
 */
import { useAuthStore } from '@/store/auth.store';
import { secureGet, secureRemove, secureSet } from './secureStorage';

const PREFIX = 'push:opt-out:';

function currentKey(): string | null {
  const id = useAuthStore.getState().user?.id;
  return id ? `${PREFIX}${id}` : null;
}

export async function isPushOptedOut(): Promise<boolean> {
  const key = currentKey();
  if (!key) return false;
  try {
    return (await secureGet(key)) === '1';
  } catch {
    return false;
  }
}

export async function setPushOptedOut(optedOut: boolean): Promise<void> {
  const key = currentKey();
  if (!key) return;
  try {
    if (optedOut) await secureSet(key, '1');
    else await secureRemove(key);
  } catch {
    /* التخزين غير متاح — الأسوأ: يعود الاشتراك التلقائي */
  }
}
