'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Debounced localStorage draft for long forms (ads, products).
 * Returns clearDraft + lastSavedAt so the UI can show "مسودة محفوظة".
 */
export function useFormDraft<T extends object>(
  key: string,
  values: T,
  options: { enabled?: boolean; debounceMs?: number } = {},
) {
  const { enabled = true, debounceMs = 800 } = options;
  const storageKey = `draft:${key}`;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRun = useRef(true);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (isFirstRun.current) {
      isFirstRun.current = false;
      // If a draft already exists, surface "restored" time as saved.
      try {
        if (window.localStorage.getItem(storageKey)) {
          setLastSavedAt(Date.now());
        }
      } catch {
        /* ignore */
      }
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(values));
        setLastSavedAt(Date.now());
      } catch {
        /* storage full / private mode */
      }
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values), enabled, storageKey, debounceMs]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(storageKey);
      setLastSavedAt(null);
    } catch {
      /* ignore */
    }
  }

  return { clearDraft, lastSavedAt };
}

/** Read a draft once (mount seed) without a subscription. */
export function readFormDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`draft:${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
