/**
 * تنظيف بيانات الحساب الخاصة عند اختيار المستخدم حذفها من الجهاز.
 * عمليات تسجيل الخروج التلقائية لا تستدعي هذا المسار حتى لا تفقد الطوابير دون اتصال.
 */
import * as SecureStore from 'expo-secure-store';
import { clearPrivateMobileData } from '@/storage/public-cache';

export const PRIVATE_CLEANUP_REQUIRED_KEY = 'marketplat.mobile.private-cleanup-required.v1';

type CleanupRequirement =
  | { ownerId: string; global: false }
  | { ownerId: null; global: true }
  | { ownerId: null; global: false; preserveLegacy: true };

/** قفل في الذاكرة إذا فشل SecureStore أثناء الجلسة الحالية */
let privateCleanupBlockedInMemory = false;
let privateCleanupOwnerInMemory: string | null = null;
let privateCleanupGlobalInMemory = false;

export function isPrivateCleanupBlockedInMemory(): boolean {
  return privateCleanupBlockedInMemory;
}

async function readCleanupRequirement(): Promise<CleanupRequirement | null> {
  if (privateCleanupBlockedInMemory) {
    return privateCleanupGlobalInMemory || !privateCleanupOwnerInMemory
      ? { ownerId: null, global: true }
      : { ownerId: privateCleanupOwnerInMemory, global: false };
  }

  // A SecureStore read failure must fail closed without guessing that a global cleanup
  // was requested. Guessing here could silently erase every account's offline data.
  const raw = await SecureStore.getItemAsync(PRIVATE_CLEANUP_REQUIRED_KEY);
  if (!raw) return null;

  // Older versions wrote the unscoped literal after BOTH manual and automatic sign-out.
  // It is therefore not proof of consent to erase every account's data. All current
  // private stores are owner-scoped, so migrate the ambiguous marker by preserving rows.
  if (raw === 'required') return { ownerId: null, global: false, preserveLegacy: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('تعذرت قراءة علامة تنظيف بيانات الحساب؛ لم نحذف أي بيانات محلية.');
  }
  if (parsed && typeof parsed === 'object') {
    const ownerId = (parsed as { ownerId?: unknown }).ownerId;
    if (typeof ownerId === 'string' && ownerId.trim()) {
      return { ownerId: ownerId.trim(), global: false };
    }
  }
  throw new Error('علامة تنظيف بيانات الحساب غير صالحة؛ لم نحذف أي بيانات محلية.');
}

export async function markPrivateCleanupRequired(ownerId: string): Promise<void> {
  const owner = ownerId.trim();
  if (!owner) throw new Error('A valid account owner is required for deferred local cleanup.');
  privateCleanupBlockedInMemory = true;
  privateCleanupOwnerInMemory = owner;
  privateCleanupGlobalInMemory = false;
  // Do not hide persistence failures: callers must know whether the retry marker
  // will survive a process restart. The in-memory block remains active on failure.
  await SecureStore.setItemAsync(PRIVATE_CLEANUP_REQUIRED_KEY, JSON.stringify({ ownerId: owner }));
}

export async function clearPrivateCleanupFlag(): Promise<void> {
  privateCleanupBlockedInMemory = false;
  privateCleanupOwnerInMemory = null;
  privateCleanupGlobalInMemory = false;
  await SecureStore.deleteItemAsync(PRIVATE_CLEANUP_REQUIRED_KEY).catch(() => undefined);
}

/**
 * تُنفّذ العلامة الحديثة لمالك محدد فقط. العلامة القديمة غير المرتبطة بمالك
 * تُرحّل مع الحفاظ على البيانات؛ فقد صدرت سابقًا أيضًا عن الخروج التلقائي.
 */
export async function ensurePrivateStorageClean(): Promise<void> {
  const requirement = await readCleanupRequirement();
  if (!requirement) return;
  try {
    if ('preserveLegacy' in requirement && requirement.preserveLegacy) {
      await clearPrivateCleanupFlag();
      return;
    }
    await clearPrivateMobileData(requirement.global ? undefined : requirement.ownerId);
    await clearPrivateCleanupFlag();
  } catch {
    privateCleanupBlockedInMemory = true;
    privateCleanupOwnerInMemory = requirement.ownerId;
    privateCleanupGlobalInMemory = requirement.global;
    throw new Error(
      'تعذر تنظيف بيانات الحساب السابق بأمان. لا يمكن تسجيل الدخول قبل نجاح تنظيف التخزين المحلي.',
    );
  }
}

/** يُستدعى عند استعادة الجلسة؛ يفشل مغلقًا عند تعذر إتمام تنظيف سبق أن اختاره المستخدم. */
export async function tryCleanupBeforeRestore(): Promise<{ blocked: boolean }> {
  let requirement: CleanupRequirement | null;
  try {
    requirement = await readCleanupRequirement();
  } catch {
    // Do not reinterpret an unavailable/corrupt marker as consent for global deletion.
    // A later login attempt may retry the read once SecureStore becomes available.
    return { blocked: true };
  }
  if (!requirement) return { blocked: false };

  try {
    if ('preserveLegacy' in requirement && requirement.preserveLegacy) {
      await clearPrivateCleanupFlag();
      return { blocked: false };
    }
    await clearPrivateMobileData(requirement.global ? undefined : requirement.ownerId);
    await clearPrivateCleanupFlag();
    return { blocked: false };
  } catch {
    privateCleanupBlockedInMemory = true;
    privateCleanupOwnerInMemory = requirement.ownerId;
    privateCleanupGlobalInMemory = requirement.global;
    return { blocked: true };
  }
}

/**
 * تنظيف بيانات حساب واحد عند تسجيل الخروج اليدوي بعد موافقة المستخدم.
 * لا يسمح بتمرير مالك فارغ لأن ذلك قد يحذف بيانات حسابات أخرى على الجهاز.
 */
export async function cleanupOnLogout(
  ownerId: string,
): Promise<{ cleanupFailed: boolean; cleanupMarkerSaved: boolean }> {
  const owner = ownerId.trim();
  if (!owner) return { cleanupFailed: true, cleanupMarkerSaved: false };
  try {
    await clearPrivateMobileData(owner);
    await clearPrivateCleanupFlag();
    return { cleanupFailed: false, cleanupMarkerSaved: true };
  } catch {
    try {
      await markPrivateCleanupRequired(owner);
      return { cleanupFailed: true, cleanupMarkerSaved: true };
    } catch {
      // The in-memory guard remains set, but the next process cannot rely on it.
      // Report this explicitly so the UI does not claim cleanup is durably queued.
      return { cleanupFailed: true, cleanupMarkerSaved: false };
    }
  }
}
