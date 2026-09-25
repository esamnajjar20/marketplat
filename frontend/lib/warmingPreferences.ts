/**
 * lib/warmingPreferences.ts
 *
 * SW-WARMING-USER-CONTROL-01: the user's chosen warming mode.
 *
 * Modes:
 *   auto     (default)  — planner decides from network signals
 *   balanced            — force 'core' tier
 *   saver               — force 'critical' (minimal)
 *   drip                — 6 routes every ~12 min (~250 KB/pass)
 *   off                 — skip warming entirely
 *
 * Persistence: localStorage. Survives CACHE_VERSION bumps (no version tag).
 */
'use client';

const STORAGE_KEY = 'marketplat:warming-pref';

export type WarmingMode = 'auto' | 'balanced' | 'saver' | 'drip' | 'off';

export const WARMING_MODE_LABELS: Record<WarmingMode, string> = {
  auto: 'تلقائي',
  balanced: 'متوازن',
  saver: 'وفّر البيانات',
  drip: 'تدريجي',
  off: 'معطّل',
};

export const WARMING_MODE_DESCRIPTIONS: Record<WarmingMode, string> = {
  auto: 'نختار المستوى حسب سرعة الشبكة. على بطاقات النت الضعيفة نقلّل التحميل تلقائياً.',
  balanced: 'صفحات أساسية فقط (~0.5–1 ميغابايت) — مناسب لشبكات متوسطة.',
  saver: 'بدون تحضير مسبق تقريباً — الأنسب لبطاقات 17–30 ك.ب/ث.',
  drip: '6 صفحات كل 12 دقيقة — خفيف وغير ملحوظ، يكتمل خلال نحو ساعتين.',
  off: 'لا نُحضّر شيئاً تلقائياً. الصفحات ستُخزَّن عند زيارتها الفعلية وأنت متصل.',
};

export const WARMING_MODE_BYTES_EST: Record<WarmingMode, string> = {
  auto: 'متغيّر حسب الشبكة',
  balanced: '~0.5–1 MB',
  saver: '~0–0.3 MB',
  drip: '~250 KB/دورة',
  off: '0 MB',
};

let current: WarmingMode = 'auto';
const listeners = new Set<(m: WarmingMode) => void>();

function parse(value: string | null): WarmingMode | null {
  if (
    value === 'auto' ||
    value === 'balanced' ||
    value === 'saver' ||
    value === 'drip' ||
    value === 'off'
  ) {
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
    // private mode / quota
  }
  return current;
}

export function setWarmingMode(mode: WarmingMode): void {
  current = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // in-memory only this session
  }
  listeners.forEach((cb) => {
    try {
      cb(mode);
    } catch {
      /* ignore */
    }
  });
}

export function onWarmingModeChange(
  listener: (m: WarmingMode) => void,
): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
