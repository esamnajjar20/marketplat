/**
 * lib/warmingPreferences.ts
 *
 * SW-WARMING-USER-CONTROL-01: the user's chosen warming mode.
 *
 * Until now warming was fully automatic — the network-aware planner
 * picked a tier on every visit based on effectiveType/downlink and
 * nothing in the app let the user say "don't spend my data on this".
 * On Gaza's metered mobile plans that decision belongs to the person
 * paying the bill. Four modes:
 *
 *   auto     (default)  — planner decides, same as before this file.
 *   balanced            — force the 'core' tier (~2 MB/pass).
 *   saver               — force 'critical' (~0.8 MB/pass; /offline only).
 *   off                 — skip warming entirely.
 *
 * Interaction with other gates, in priority order (see planner):
 *   1. mode === 'off'                 -> none
 *   2. navigator offline              -> none
 *   3. conn.saveData === true         -> none  (OS-level data saver wins)
 *   4. mode === 'saver' / 'balanced'  -> critical / core
 *   5. mode === 'auto'                -> planner's own decision
 *
 * Persistence: localStorage. Unlike the snapshot in offlineWarmingState
 * this is a *preference*, not derived state — it lives alongside other
 * UI settings and must survive CACHE_VERSION bumps. It has no
 * cacheVersion tag on purpose.
 */
'use client';

const STORAGE_KEY = 'marketplat:warming-pref';

export type WarmingMode = 'auto' | 'balanced' | 'saver' | 'off';

export const WARMING_MODE_LABELS: Record<WarmingMode, string> = {
  auto: 'تلقائي',
  balanced: 'متوازن',
  saver: 'وفّر البيانات',
  off: 'معطّل',
};

export const WARMING_MODE_DESCRIPTIONS: Record<WarmingMode, string> = {
  auto: 'نختار المستوى المناسب حسب سرعة شبكتك — الأفضل عادةً.',
  balanced: 'نُحضّر الصفحات الأساسية دائماً (~2 ميغابايت لكل دورة).',
  saver: 'الصفحة الأساسية فقط عند انقطاع الإنترنت — أقل استهلاك (~0.8 ميغابايت).',
  off: 'لا نُحضّر شيئاً تلقائياً. الصفحات ستُخزَّن عند زيارتها الفعلية وأنت متصل.',
};

export const WARMING_MODE_BYTES_EST: Record<WarmingMode, string> = {
  auto: 'متغيّر حسب الشبكة',
  balanced: '~2 MB',
  saver: '~0.8 MB',
  off: '0 MB',
};

let current: WarmingMode = 'auto';
const listeners = new Set<(m: WarmingMode) => void>();

function parse(value: string | null): WarmingMode | null {
  if (value === 'auto' || value === 'balanced' || value === 'saver' || value === 'off') {
    return value;
  }
  return null;
}

export function getWarmingMode(): WarmingMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = parse(raw);
    if (parsed) {
      current = parsed;
      return parsed;
    }
  } catch {
    // localStorage may throw (private mode, quota) — fall through to
    // the in-memory default, same posture as the rest of this app's
    // storage helpers.
  }
  return current;
}

export function setWarmingMode(mode: WarmingMode): void {
  current = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // silent — the mode is still applied in-memory this session
  }
  listeners.forEach((cb) => {
    try { cb(mode); } catch { /* ignore */ }
  });
}

/** Subscribe to mode changes (returns unsubscribe). Fires immediately
 * with the current mode so subscribers don't need a separate read. */
export function onWarmingModeChange(
  listener: (m: WarmingMode) => void,
): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
