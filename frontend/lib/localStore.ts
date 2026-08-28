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

/** تشغيل ترحيل بسيط عند تحديث المخطط */
export function ensureLocalSchema(): void {
  if (typeof window === 'undefined') return;
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
  } catch {
    return false;
  }
}

export function localRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PREFIX + key);
    window.dispatchEvent(
      new CustomEvent('marketplat:local-change', { detail: { key } }),
    );
  } catch {
    /* ignore */
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
