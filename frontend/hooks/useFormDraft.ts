'use client';

import { useEffect, useRef, useState } from 'react';
import { getCurrentOfflineUserId } from '@/lib/offlineUserScope';

/**
 * Debounced localStorage draft for long forms (ads, products).
 * keeps last 5 payload snapshots for restore.
 */

const MAX_VERSIONS = 5;

export interface FormDraftVersion<T> {
  savedAt: number;
  values: T;
}

function scopedKey(key: string): string {
  return `draft:${getCurrentOfflineUserId() ?? 'guest'}:${key}`;
}

function historyKey(key: string) {
  return `${scopedKey(key)}:history`;
}

function readHistory<T>(key: string): FormDraftVersion<T>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(historyKey(key));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as FormDraftVersion<T>[]) : [];
  } catch {
    return [];
  }
}

function writeHistory<T>(key: string, versions: FormDraftVersion<T>[]) {
  try {
    window.localStorage.setItem(
      historyKey(key),
      JSON.stringify(versions.slice(0, MAX_VERSIONS)),
    );
  } catch {
    /* ignore */
  }
}

export function useFormDraft<T extends object>(
  key: string,
  values: T,
  options: { enabled?: boolean; debounceMs?: number } = {},
) {
  const { enabled = true, debounceMs = 800 } = options;
  const storageKey = scopedKey(key);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRun = useRef(true);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [versions, setVersions] = useState<FormDraftVersion<T>[]>([]);
  const valuesRef = useRef(values);
  const storageKeyRef = useRef(storageKey);
  const mountStorageKeyRef = useRef(storageKey);
  valuesRef.current = values;
  storageKeyRef.current = storageKey;

  useEffect(() => {
    if (!enabled) return;
    setVersions(readHistory<T>(key));
  }, [key, enabled]);

  const persistCurrentValues = () => {
    // Never write a mounted form into another account's draft namespace.
    if (storageKeyRef.current !== mountStorageKeyRef.current) {
      setSaveError('تغيّر الحساب أثناء فتح النموذج. افتح النموذج مجددًا لحماية خصوصية المسودة.');
      return false;
    }
    try {
      const currentValues = valuesRef.current;
      const serialized = JSON.stringify(currentValues);
      const prevRaw = window.localStorage.getItem(storageKeyRef.current);
      if (prevRaw) {
        try {
          const prev = JSON.parse(prevRaw) as T;
          if (JSON.stringify(prev) !== serialized) {
            const nextHist: FormDraftVersion<T>[] = [
              { savedAt: Date.now(), values: prev },
              ...readHistory<T>(key),
            ].slice(0, MAX_VERSIONS);
            writeHistory(key, nextHist);
            setVersions(nextHist);
          }
        } catch {
          // A malformed prior draft must not prevent saving the current one.
        }
      }
      window.localStorage.setItem(storageKeyRef.current, serialized);
      setLastSavedAt(Date.now());
      setSaveError(null);
      return true;
    } catch {
      setSaveError('تعذّر حفظ المسودة على هذا الجهاز. قد تكون مساحة التخزين ممتلئة؛ انسخ النص المهم قبل مغادرة الصفحة.');
      return false;
    }
  };

  useEffect(() => {
    if (!enabled) return;
    if (storageKey !== mountStorageKeyRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setSaveError('تغيّر الحساب أثناء فتح النموذج. افتح النموذج مجددًا لحماية خصوصية المسودة.');
      return;
    }
    if (isFirstRun.current) {
      isFirstRun.current = false;
      try {
        if (window.localStorage.getItem(storageKey)) {
          setLastSavedAt(Date.now());
          setSaveError(null);
        }
      } catch {
        setSaveError('تعذّر الوصول إلى التخزين المحلي على هذا الجهاز.');
      }
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsSaving(true);
    timerRef.current = setTimeout(() => {
      persistCurrentValues();
      setIsSaving(false);
      timerRef.current = null;
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values), enabled, storageKey, debounceMs, key]);

  // Flush a pending debounced write when the tab is hidden or navigated away.
  // localStorage is synchronous, so this is the last-resort guard against losing
  // the final keystrokes on mobile back gestures / app backgrounding.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        persistCurrentValues();
        setIsSaving(false);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      // Client-side route changes do not emit pagehide; flush during cleanup too.
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // Stable listeners read latest values through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function clearDraft() {
    if (storageKeyRef.current !== mountStorageKeyRef.current) {
      setSaveError('تغيّر الحساب أثناء فتح النموذج. لم تُحذف أي مسودة لحماية بيانات الحساب الآخر.');
      return;
    }
    // Cancel any pending debounced write first. Otherwise the unmount flush
    // would re-create the draft that was just discarded (e.g. after a
    // successful publish), and the stale draft would reappear next time.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsSaving(false);
    try {
      window.localStorage.removeItem(storageKey);
      window.localStorage.removeItem(historyKey(key));
      setLastSavedAt(null);
      setSaveError(null);
      setVersions([]);
    } catch {
      /* ignore */
    }
  }

  /** Restore a historical snapshot into storage (caller should re-seed form). */
  function restoreVersion(index: number): T | null {
    if (storageKeyRef.current !== mountStorageKeyRef.current) {
      setSaveError('تغيّر الحساب أثناء فتح النموذج. افتح النموذج مجددًا لاستعادة المسودة بأمان.');
      return null;
    }
    const hist = readHistory<T>(key);
    const ver = hist[index];
    if (!ver) return null;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(ver.values));
      setLastSavedAt(Date.now());
      return ver.values;
    } catch {
      return null;
    }
  }

  return { clearDraft, lastSavedAt, isSaving, saveError, versions, restoreVersion };
}

/** Read a draft once (mount seed) without a subscription. */
export function readFormDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function listFormDraftVersions<T>(key: string): FormDraftVersion<T>[] {
  return readHistory<T>(key);
}
