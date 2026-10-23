'use client';

/**
 * lib/warmingPreferences.ts
 *
 * User-facing warming controls for /settings/offline.
 *
 * Three modes:
 *   off   — no automatic warming
 *   fast  — the core route budget + the pinned offline hub
 *   full  — every known route
 *
 * Warming is scheduled by lib/offlineWarmingScheduler.ts after load/login/
 * reconnect/visibility, plus a cheap in-app tick every 10 minutes while
 * visible. Freshness gates decide whether anything is actually fetched. It
 * can also be triggered on demand from /settings/offline.
 */

const STORAGE_KEY = 'marketplat:warming-pref';

export type WarmingMode = 'off' | 'fast' | 'full';

export const WARMING_MODE_LABELS: Record<WarmingMode, string> = {
  off:  'إيقاف التسخين',
  fast: 'تسخين سريع',
  full: 'تسخين كامل',
};

export const WARMING_MODE_DESCRIPTIONS: Record<WarmingMode, string> = {
  off:  'لا نُحضّر شيئاً. الصفحات تُخزَّن عند زيارتك لها فقط.',
  fast: 'الصفحات الأساسية الأكثر استخدامًا — أخف وأسرع وأقل استهلاكاً للبيانات. باقي الصفحات تُخزَّن عند زيارتها.',
  full: 'كل الصفحات المعروفة للتطبيق — يستهلك بيانات وتخزينًا أكثر. على الشبكات البطيئة نُبطّئ التنفيذ بدل تقليص النطاق.',
};

let current: WarmingMode = 'off';
const listeners = new Set<(m: WarmingMode) => void>();

// GLOBAL-OPTIMIZATION-1A: warming is locked to disabled ('off') everywhere.
// The default state is 'off' and any persisted localStorage value is
// overridden back to 'off' on read so a previously saved 'fast'/'full'
// preference can never take effect again.

export function getWarmingMode(): WarmingMode {
  if (typeof window === 'undefined') return 'off';
  try {
    // Override any stored preference so warming stays disabled.
    localStorage.setItem(STORAGE_KEY, 'off');
    current = 'off';
    return 'off';
  } catch { /* private mode */ }
  return current;
}

export function setWarmingMode(mode: WarmingMode): void {
  current = mode;
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* in-memory */ }
  listeners.forEach((cb) => { try { cb(mode); } catch { /* ignore */ } });
}

export function onWarmingModeChange(listener: (m: WarmingMode) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => { listeners.delete(listener); };
}
