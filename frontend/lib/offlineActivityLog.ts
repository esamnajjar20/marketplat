/**
 * سجل نشاط بسيط لمركز الأوفلاين — محلي (localStorage)، آخر N حدث.
 */

export type OfflineActivityKind =
  | 'sync_ok'
  | 'sync_fail'
  | 'sync_skipped_wifi'
  | 'draft_saved'
  | 'queue_retry'
  | 'hub_open';

export type OfflineActivityEntry = {
  id: string;
  kind: OfflineActivityKind;
  message: string;
  at: number;
};

const KEY = 'offline-hub:activity-log-v1';
const MAX = 30;

const KIND_LABEL: Record<OfflineActivityKind, string> = {
  sync_ok: 'مزامنة ناجحة',
  sync_fail: 'تعذّر الإرسال',
  sync_skipped_wifi: 'تأجيل (Wi‑Fi فقط)',
  draft_saved: 'مسودة',
  queue_retry: 'إعادة محاولة',
  hub_open: 'فتح المركز',
};

export function getActivityKindLabel(kind: OfflineActivityKind): string {
  return KIND_LABEL[kind] ?? kind;
}

function readAll(): OfflineActivityEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineActivityEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: OfflineActivityEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
    window.dispatchEvent(new CustomEvent('offline-hub:activity'));
  } catch {
    /* ignore */
  }
}

export function listOfflineActivity(limit = 15): OfflineActivityEntry[] {
  return readAll().slice(0, limit);
}

export function logOfflineActivity(
  kind: OfflineActivityKind,
  message: string,
): void {
  const entry: OfflineActivityEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    message,
    at: Date.now(),
  };
  const next = [entry, ...readAll()].slice(0, MAX);
  writeAll(next);
}

export function clearOfflineActivity(): void {
  writeAll([]);
}

export function formatActivityTime(at: number): string {
  try {
    return new Date(at).toLocaleString('ar', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return '';
  }
}
