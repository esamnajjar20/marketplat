/**
 * تنظيف بيانات الحساب الخاصة قبل تسجيل دخول جديد / بعد الخروج.
 * يمنع تسرّب بيانات حساب سابق على نفس الجهاز.
 */
import * as SecureStore from 'expo-secure-store';
import { clearPrivateMobileData } from '@/storage/public-cache';

export const PRIVATE_CLEANUP_REQUIRED_KEY = 'marketplat.mobile.private-cleanup-required.v1';

/** قفل في الذاكرة إذا فشل SecureStore أثناء الجلسة الحالية */
let privateCleanupBlockedInMemory = false;

export function isPrivateCleanupBlockedInMemory(): boolean {
  return privateCleanupBlockedInMemory;
}

export async function markPrivateCleanupRequired(): Promise<void> {
  privateCleanupBlockedInMemory = true;
  await SecureStore.setItemAsync(PRIVATE_CLEANUP_REQUIRED_KEY, 'required').catch(() => undefined);
}

export async function clearPrivateCleanupFlag(): Promise<void> {
  privateCleanupBlockedInMemory = false;
  await SecureStore.deleteItemAsync(PRIVATE_CLEANUP_REQUIRED_KEY).catch(() => undefined);
}

/**
 * إن وُجدت علامة تنظيف مطلوبة: ينظّف ثم يزيل العلامة.
 * يفشل بشكل مغلق (throw) إن تعذّر التنظيف — لا يُسمح بتسجيل دخول جديد.
 */
export async function ensurePrivateStorageClean(): Promise<void> {
  const required = privateCleanupBlockedInMemory
    ? 'required'
    : await SecureStore.getItemAsync(PRIVATE_CLEANUP_REQUIRED_KEY).catch(() => 'required');
  if (!required) return;
  try {
    await clearPrivateMobileData();
    await clearPrivateCleanupFlag();
  } catch {
    privateCleanupBlockedInMemory = true;
    throw new Error(
      'تعذر تنظيف بيانات الحساب السابق بأمان. لا يمكن تسجيل الدخول قبل نجاح تنظيف التخزين المحلي.',
    );
  }
}

/**
 * يُستدعى عند استعادة الجلسة: إن فشل التنظيف يُرجع true لوقف الاستعادة.
 */
export async function tryCleanupBeforeRestore(): Promise<{ blocked: boolean }> {
  try {
    const cleanupRequired = await SecureStore.getItemAsync(PRIVATE_CLEANUP_REQUIRED_KEY).catch(
      () => 'required',
    );
    if (cleanupRequired || privateCleanupBlockedInMemory) {
      try {
        await clearPrivateMobileData();
        await clearPrivateCleanupFlag();
      } catch {
        privateCleanupBlockedInMemory = true;
        return { blocked: true };
      }
    }
  } catch {
    // Fail closed: caller should not restore a session.
  }
  return { blocked: false };
}

/**
 * تنظيف عند الخروج. يعيد cleanupFailed إن لم يكتمل حذف بيانات الحساب.
 */
export async function cleanupOnLogout(): Promise<{ cleanupFailed: boolean }> {
  try {
    await clearPrivateMobileData();
    await clearPrivateCleanupFlag();
    return { cleanupFailed: false };
  } catch {
    await markPrivateCleanupRequired();
    return { cleanupFailed: true };
  }
}
