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
  const [versions, setVersions] = useState<FormDraftVersion<T>[]>([]);

  useEffect(() => {
    if (!enabled) return;
    setVersions(readHistory<T>(key));
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (isFirstRun.current) {
      isFirstRun.current = false;
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
        const prevRaw = window.localStorage.getItem(storageKey);
        if (prevRaw) {
          try {
            const prev = JSON.parse(prevRaw) as T;
            if (JSON.stringify(prev) !== JSON.stringify(values)) {
              const nextHist: FormDraftVersion<T>[] = [
                { savedAt: Date.now(), values: prev },
                ...readHistory<T>(key),
              ].slice(0, MAX_VERSIONS);
              writeHistory(key, nextHist);
              setVersions(nextHist);
            }
          } catch {
            /* ignore parse */
          }
        }
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
  }, [JSON.stringify(values), enabled, storageKey, debounceMs, key]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(storageKey);
      window.localStorage.removeItem(historyKey(key));
      setLastSavedAt(null);
      setVersions([]);
    } catch {
      /* ignore */
    }
  }

  /** Restore a historical snapshot into storage (caller should re-seed form). */
  function restoreVersion(index: number): T | null {
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

  return { clearDraft, lastSavedAt, versions, restoreVersion };
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
