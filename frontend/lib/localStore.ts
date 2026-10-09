/**
 * تخزين محلي موحّد (localStorage) مع إصدار مخطط وتنظيف آمن.
 * يُستخدم لجهات الدفع، البطاقات، وسجلات التنزيل، وأي بيانات جهاز-محلية.
 */

import { safeStorageGet, safeStorageRemove, safeStorageSet, serializeStorageValue } from '@/lib/browserStorage';

const PREFIX = 'marketplat:';
const META_KEY = `${PREFIX}__meta`;

export const LOCAL_SCHEMA_VERSION = 2;

interface Meta {
  schemaVersion: number;
  updatedAt: string;
}

function readMeta(): Meta {
  if (typeof window === 'undefined') {
    return { schemaVersion: LOCAL_SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  }
  try {
    const raw = safeStorageGet(META_KEY);
    if (!raw) return { schemaVersion: 1, updatedAt: new Date().toISOString() };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { schemaVersion: 1, updatedAt: new Date().toISOString() };
    }
    const meta = parsed as Partial<Meta>;
    if (!Number.isInteger(meta.schemaVersion) || typeof meta.updatedAt !== 'string') {
      return { schemaVersion: 1, updatedAt: new Date().toISOString() };
    }
    return { schemaVersion: meta.schemaVersion as number, updatedAt: meta.updatedAt };
  } catch {
    return { schemaVersion: 1, updatedAt: new Date().toISOString() };
  }
}

function writeMeta(meta: Meta) {
  if (typeof window === 'undefined') return;
  const serialized = serializeStorageValue(meta);
  if (serialized !== null) safeStorageSet(META_KEY, serialized);
}

/**
 * FIX LOCAL-SCHEMA-CACHE: cache للنتيجة — قبل، كل localGet/localSet كان
 * يقرأ META_KEY + JSON.parse (بطء في القوائم الطويلة + بلا فائدة).
 */
let schemaEnsured = false;

export function ensureLocalSchema(): void {
  if (typeof window === 'undefined') return;
  if (schemaEnsured) return;
  const meta = readMeta();
  if (meta.schemaVersion >= LOCAL_SCHEMA_VERSION) {
    schemaEnsured = true;
    return;
  }
  // حجرات ترحيل مستقبلية هنا
  writeMeta({ schemaVersion: LOCAL_SCHEMA_VERSION, updatedAt: new Date().toISOString() });
  schemaEnsured = true;
}

export function localGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  ensureLocalSchema();
  try {
    const raw = safeStorageGet(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function localSet(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false;
  ensureLocalSchema();
  try {
    const serialized = serializeStorageValue(value);
    if (serialized === null) return false;
    if (!safeStorageSet(PREFIX + key, serialized)) {
      throw new Error('Browser storage is unavailable or write failed');
    }
    writeMeta({ schemaVersion: LOCAL_SCHEMA_VERSION, updatedAt: new Date().toISOString() });
    try {
      window.dispatchEvent(
        new CustomEvent('marketplat:local-change', { detail: { key } }),
      );
    } catch {
      /* ignore */
    }
    return true;
  } catch (err) {
    // FIX LOCAL-QUOTA-LOGGING: quota exceeded (5-10 MB) كان يُرجع false
    // بصمت — المتصلون (saveAdDraft/saveOfflineList/saveOfflineJson) لا
    // يفحصون القيمة، فيظن المستخدم أن البيانات محفوظة بينما ضاعت فعلاً.
    // الآن: نُسجّل + نُطلق event كي تعرض الواجهة تحذيرًا (مستقبلًا).
    const isQuota = err instanceof DOMException
      && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    console.warn(
      isQuota
        ? `[localStore] localStorage quota exceeded for key: ${key}`
        : `[localStore] localSet failed for key ${key}:`,
      err,
    );
    try {
      window.dispatchEvent(
        new CustomEvent('marketplat:local-error', {
          detail: { key, reason: isQuota ? 'quota' : 'unknown' },
        }),
      );
    } catch {
      /* ignore */
    }
    return false;
  }
}

export function localRemove(key: string): void {
  if (typeof window === 'undefined') return;
  ensureLocalSchema();
  try {
    if (!safeStorageRemove(PREFIX + key)) {
      console.warn('[localStore] localRemove could not access browser storage for key:', key);
      return;
    }
    window.dispatchEvent(
      new CustomEvent('marketplat:local-change', { detail: { key } }),
    );
  } catch (err) {
    // FIX LOCAL-REMOVE-LOGGING: removeItem نادرًا ما يفشل، لكن نسجّل.
    console.warn('[localStore] localRemove failed for key:', key, err);
  }
}

export function estimateLocalUsageBytes(): number {
  if (typeof window === 'undefined') return 0;
  let total = 0;
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    if (!storage) return 0;
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      total += (k.length + (safeStorageGet(k)?.length ?? 0)) * 2;
    }
  } catch {
    /* ignore */
  }
  return total;
}
