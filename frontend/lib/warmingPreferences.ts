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
'use client';

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

let current: WarmingMode = 'fast';
const listeners = new Set<(m: WarmingMode) => void>();

function parseMode(raw: string | null): WarmingMode | null {
  if (raw === 'off' || raw === 'fast' || raw === 'full') return raw;
  // Migration from the old five-mode scheme.
  if (raw === 'auto' || raw === 'balanced' || raw === 'drip') return 'fast';
  if (raw === 'saver') return 'off';
  return null;
}

export function getWarmingMode(): WarmingMode {
  if (typeof window === 'undefined') return 'fast';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = parseMode(raw);
    if (parsed) { current = parsed; return parsed; }
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
