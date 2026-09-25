/**
 * OFFLINE-FRESHNESS-01 — unified "how old is this offline data?" helpers.
 *
 * Previously formatOfflineSavedAt lived only in offlineJsonCache.ts and
 * list-cache consumers reimplemented similar copy. Centralising here
 * keeps every offline surface (lists, JSON slots, messages, drafts)
 * consistent, and gives a single isOfflineStale() gate for banners.
 */

/** Default thresholds (ms). Override per-call when a surface needs tighter TTL. */
export const OFFLINE_STALE_AFTER_MS = {
  /** Lists / home / search results — soft stale after 30 min. */
  list: 30 * 60 * 1000,
  /** Profile / dashboard attention — soft stale after 15 min. */
  profile: 15 * 60 * 1000,
  /** Messages / conversations — soft stale after 5 min. */
  messages: 5 * 60 * 1000,
  /** Hard "don't trust" after 24 h for any personal data. */
  hard: 24 * 60 * 60 * 1000,
} as const;

export type OfflineFreshnessKind = keyof typeof OFFLINE_STALE_AFTER_MS;

/**
 * True when savedAt is older than the threshold for `kind`.
 * Invalid / empty savedAt → treated as stale (safe default).
 */
export function isOfflineStale(
  savedAt: string | null | undefined,
  kind: OfflineFreshnessKind = 'list',
): boolean {
  if (!savedAt) return true;
  try {
    const age = Date.now() - new Date(savedAt).getTime();
    if (Number.isNaN(age) || age < 0) return true;
    return age > OFFLINE_STALE_AFTER_MS[kind];
  } catch {
    return true;
  }
}

/** Arabic relative "آخر تحديث: …" label for UI badges. */
export function formatOfflineSavedAt(savedAt: string | null | undefined): string {
  if (!savedAt) return '';
  try {
    const ms = Date.now() - new Date(savedAt).getTime();
    if (Number.isNaN(ms)) return '';
    const mins = Math.max(0, Math.floor(ms / 60_000));
    if (mins < 1) return 'آخر تحديث: الآن تقريبًا';
    if (mins < 60) return `آخر تحديث: منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `آخر تحديث: منذ ${hours} ساعة`;
    return `آخر تحديث: ${new Date(savedAt).toLocaleString('ar')}`;
  } catch {
    return '';
  }
}

/**
 * Short badge text when data is offline/stale.
 * Returns empty string when fresh and online (caller can skip render).
 */
export function offlineFreshnessLabel(
  savedAt: string | null | undefined,
  options: {
    kind?: OfflineFreshnessKind;
    isOffline?: boolean;
  } = {},
): string {
  const kind = options.kind ?? 'list';
  const offline =
    options.isOffline ??
    (typeof navigator !== 'undefined' && navigator.onLine === false);

  if (!savedAt) {
    return offline ? 'بيانات غير متوفرة دون اتصال' : '';
  }

  const relative = formatOfflineSavedAt(savedAt);
  if (offline) {
    return relative ? `${relative} (دون اتصال)` : 'عرض من النسخة المحلية';
  }
  if (isOfflineStale(savedAt, kind)) {
    return relative ? `${relative} — قد تكون قديمة` : 'قد تكون البيانات قديمة';
  }
  return relative;
}
