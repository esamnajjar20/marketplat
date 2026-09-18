/**
 * تخزين محلي موحّد (localStorage) مع إصدار مخطط وتنظيف آمن.
 * يُستخدم لجهات الدفع، البطاقات، وسجلات التنزيل، وأي بيانات جهاز-محلية.
 */

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
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { schemaVersion: 1, updatedAt: new Date().toISOString() };
    return JSON.parse(raw) as Meta;
  } catch {
    return { schemaVersion: 1, updatedAt: new Date().toISOString() };
  }
}

function writeMeta(meta: Meta) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* quota */
  }
}

/**
 * FIX LOCAL-SCHEMA-CACHE: cache للنتيجة — قبل، كل localGet/localSet كان
 * يقرأ META_KEY + JSON.parse (بطء في القوائم الطويلة + بلا فائدة).
 */
let schemaEnsured = false;

/** تشغيل ترحيل بسيط عند تحديث المخطط */
export function ensureLocalSchema(): void {
  if (typeof window === 'undefined') return;
  if (schemaEnsured) return;
  schemaEnsured = true;
  const meta = readMeta();
  if (meta.schemaVersion >= LOCAL_SCHEMA_VERSION) return;
  // حجرات ترحيل مستقبلية هنا
  writeMeta({ schemaVersion: LOCAL_SCHEMA_VERSION, updatedAt: new Date().toISOString() });
}

export function localGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  ensureLocalSchema();
  try {
    const raw = localStorage.getItem(PREFIX + key);
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
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
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
    localStorage.removeItem(PREFIX + key);
    window.dispatchEvent(
      new CustomEvent('marketplat:local-change', { detail: { key } }),
    );
  } catch (err) {
    // FIX LOCAL-REMOVE-LOGGING: removeItem نادرًا ما يفشل، لكن نسجّل.
    console.warn('[localStore] localRemove failed for key:', key, err);
  }
}

/** تقديري لحجم بيانات marketplat في localStorage (بايت) */
export function estimateLocalUsageBytes(): number {
  if (typeof window === 'undefined') return 0;
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      total += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2;
    }
  } catch {
    /* ignore */
  }
  return total;
}
