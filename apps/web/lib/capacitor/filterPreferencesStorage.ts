/**
 * Zustand storage adapter: Capacitor Preferences on native, localStorage on web.
 *
 * Usage in filter.store.ts:
 *
 *   storage: createJSONStorage(() => filterPreferencesStorage),
 *
 * Mirrors the dual-backend pattern in nativeSessionStorage.ts.
 */

'use client';

import type { StateStorage } from 'zustand/middleware';

const PREFIX = 'marketplat:filters:';

async function nativeGet(name: string): Promise<string | null> {
  try {
    const { isNativePlatform } = await import('@/lib/capacitor/platform');
    if (!(await isNativePlatform())) return null;
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: PREFIX + name });
    return value;
  } catch {
    return null;
  }
}

async function nativeSet(name: string, value: string): Promise<void> {
  try {
    const { isNativePlatform } = await import('@/lib/capacitor/platform');
    if (!(await isNativePlatform())) return;
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: PREFIX + name, value });
  } catch {
    // ignore
  }
}

async function nativeRemove(name: string): Promise<void> {
  try {
    const { isNativePlatform } = await import('@/lib/capacitor/platform');
    if (!(await isNativePlatform())) return;
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: PREFIX + name });
  } catch {
    // ignore
  }
}

/**
 * StateStorage that prefers Capacitor Preferences, falls back to localStorage.
 * Zustand persist supports async getItem (returns Promise).
 */
export const filterPreferencesStorage: StateStorage = {
  getItem: async (name) => {
    const fromNative = await nativeGet(name);
    if (fromNative != null) return fromNative;
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    await nativeSet(name, value);
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(name, value);
    } catch {
      // quota / private mode
    }
  },
  removeItem: async (name) => {
    await nativeRemove(name);
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};
