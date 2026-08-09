'use client';

import { useEffect, useRef } from 'react';

/**
 * FIX P1-11: AdForm and ProductForm had no autosave — navigating away
 * by accident (back gesture, a tab switch that triggers a reload, a
 * dropped connection mid-fill) or the browser simply closing lost the
 * entire form, which is a real cost on these two specifically: title,
 * a description that can run to 5000 characters, and a multi-image
 * upload. This hook is a generic "debounce + persist a JSON-safe
 * subset of form state to localStorage, restore it once on mount"
 * helper shared by both.
 *
 * Deliberately text-fields-only: File objects (new image uploads)
 * can't survive JSON.stringify/localStorage round-trips, so callers
 * should pass only the serializable slice of their form values (e.g.
 * omit `images`), not the whole values object. Existing-image URLs
 * (strings) are fine to include if a caller wants that restored too.
 *
 * Draft key is scoped per mode+id so a "new ad" draft and an
 * "editing ad X" draft never collide, and so switching between
 * editing two different ads doesn't leak one's draft into the other.
 */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  values: T,
  options: { enabled?: boolean; debounceMs?: number } = {},
) {
  const { enabled = true, debounceMs = 800 } = options;
  const storageKey = `draft:${key}`;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skip persisting the very first render (the initial/restored
  // values) so restoring a draft doesn't immediately re-save itself.
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(values));
      } catch {
        // Storage full or unavailable (private browsing) — losing
        // autosave silently is strictly better than crashing the form.
      }
    }, debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values), enabled, storageKey, debounceMs]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Same as above — non-fatal if storage isn't available.
    }
  }

  return { clearDraft };
}

/** Reads a previously-saved draft for `key`, or null if there isn't one / it's unreadable. */
export function readFormDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`draft:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
