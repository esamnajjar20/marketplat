/**
 * Filter store — Zustand with optional persistence for native/offline.
 *
 * Responsibilities:
 *  - Own the full SearchFilterState while the sheet is open (draft).
 *  - Sync draft → URL via router.replace on Apply.
 *  - Count active filters for badge.
 *  - Persist last-used filters so reopen feels instant on native.
 *
 * URL remains the source of truth when the search page is active;
 * the store is the working copy inside the sheet.
 *
 * GPS-free product: UI must not call setNearby; Apply strips lat/lng.
 */

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SearchFilterState, AdCondition } from '@/types/filter.types';
import type { SearchSort } from '@/types/search.types';
import { DEFAULT_RADIUS_KM } from '@/types/filter.types';
import {
  parseSearchParams,
  stateToSearchParams,
  countActiveFilters,
} from '@/lib/filterUrl';

export { parseSearchParams, stateToSearchParams, countActiveFilters };

/** No-op storage for SSR (same pattern as auth.store.ts). */
const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
};

function getClientStorage(): Storage {
  if (typeof window === 'undefined') return noopStorage;
  return localStorage;
}

interface FilterStore {
  draft: SearchFilterState;
  isSheetOpen: boolean;

  openSheet: (fromUrl: SearchFilterState) => void;
  closeSheet: () => void;

  setDraft: (partial: Partial<SearchFilterState>) => void;
  setCity: (city: string | undefined) => void;
  setCategoryId: (id: string | undefined) => void;
  setPrice: (min?: number, max?: number) => void;
  setCondition: (c: AdCondition | undefined) => void;
  setSort: (s: SearchSort | undefined) => void;
  setNearby: (lat: number, lng: number, radius?: number) => void;
  clearNearby: () => void;
  resetDraft: (keep?: Pick<SearchFilterState, 'q' | 'type'>) => void;

  activeCount: () => number;
  toSearchParams: () => URLSearchParams;
}

export const useFilterStore = create<FilterStore>()(
  persist(
    (set, get) => ({
      draft: {},
      isSheetOpen: false,

      openSheet: (fromUrl) =>
        set({
          draft: { ...fromUrl },
          isSheetOpen: true,
        }),

      closeSheet: () => set({ isSheetOpen: false }),

      setDraft: (partial) =>
        set((s) => ({ draft: { ...s.draft, ...partial } })),

      setCity: (city) =>
        set((s) => ({
          draft: { ...s.draft, city: city || undefined },
        })),

      setCategoryId: (id) =>
        set((s) => ({
          draft: { ...s.draft, categoryId: id || undefined },
        })),

      setPrice: (min, max) =>
        set((s) => ({
          draft: {
            ...s.draft,
            minPrice: min != null && !Number.isNaN(min) ? min : undefined,
            maxPrice: max != null && !Number.isNaN(max) ? max : undefined,
          },
        })),

      setCondition: (c) =>
        set((s) => ({
          draft: { ...s.draft, condition: c },
        })),

      setSort: (sort) =>
        set((s) => ({
          draft: { ...s.draft, sort },
        })),

      setNearby: (lat, lng, radius = DEFAULT_RADIUS_KM) =>
        set((s) => ({
          draft: {
            ...s.draft,
            lat,
            lng,
            radius,
            sort:
              s.draft.sort === 'distance' || !s.draft.sort
                ? 'distance'
                : s.draft.sort,
          },
        })),

      clearNearby: () =>
        set((s) => {
          const next = { ...s.draft };
          delete next.lat;
          delete next.lng;
          delete next.radius;
          if (next.sort === 'distance') delete next.sort;
          return { draft: next };
        }),

      resetDraft: (keep) =>
        set({
          draft: {
            q: keep?.q,
            type: keep?.type ?? 'all',
          },
        }),

      activeCount: () => countActiveFilters(get().draft),

      toSearchParams: () => stateToSearchParams(get().draft),
    }),
    {
      name: 'marketplat-filter-draft',
      partialize: (s) => ({ draft: s.draft }),
      storage: createJSONStorage(() => getClientStorage()),
    },
  ),
);

export const selectDraft = (s: FilterStore) => s.draft;
export const selectIsSheetOpen = (s: FilterStore) => s.isSheetOpen;
export const selectActiveCount = (s: FilterStore) => s.activeCount();
