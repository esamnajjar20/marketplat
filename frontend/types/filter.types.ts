/**
 * Unified filter types for MarketPlat search (Web + Native/Capacitor).
 *
 * Aligned with backend search.validation.ts / search.types.ts and
 * frontend types/search.types.ts (SearchQuery).
 *
 * Design goals:
 *  - Single source of truth for every filter key the UI can set.
 *  - Serializable to URLSearchParams and to Capacitor Preferences.
 *  - Type-safe counts for active-filter badges and chips.
 */

import type { SearchSort, SearchType } from '@/types/search.types';

/** Ad condition — must match backend Prisma enum / search validation. */
export type AdCondition = 'NEW' | 'USED' | 'REFURBISHED';

/**
 * Canonical filter state. Every key is optional; absent = "not applied".
 * `q` and `type` are kept here so the store can own the full search
 * context, but Active-Filters UI treats `q` as the query (not a filter)
 * and `type` as a tab (not a chip).
 */
export interface SearchFilterState {
  q?: string;
  type?: SearchType;
  city?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: AdCondition;
  sort?: SearchSort;
  /** @deprecated GPS-free product: UI never sets these. Kept for old shared URLs only. */
  lat?: number;
  lng?: number;
  /** @deprecated with lat/lng */
  radius?: number;
  page?: number;
}

/** Keys that count as "active filters" for badge / chips (excludes q, type, page). */
export const ACTIVE_FILTER_KEYS = [
  'city',
  'categoryId',
  'minPrice',
  'maxPrice',
  'condition',
  'sort',
  'lat', // presence of lat implies nearby; lng/radius follow
] as const;

export type ActiveFilterKey = (typeof ACTIVE_FILTER_KEYS)[number];

/** Human-readable labels (Arabic) for chips and analytics. */
export const FILTER_LABELS: Record<string, string> = {
  city: 'المدينة',
  categoryId: 'الفئة',
  minPrice: 'السعر من',
  maxPrice: 'السعر إلى',
  condition: 'الحالة',
  sort: 'الترتيب',
  nearby: 'قريب مني',
  radius: 'نطاق البحث',
};

export const CONDITION_LABELS: Record<AdCondition, string> = {
  NEW: 'جديد',
  USED: 'مستعمل',
  REFURBISHED: 'مجدد',
};

export const SORT_LABELS: Record<SearchSort, string> = {
  relevance: 'الأكثر صلة',
  newest: 'الأحدث',
  price_asc: 'السعر: من الأقل',
  price_desc: 'السعر: من الأعلى',
  rating: 'الأعلى تقييماً',
  views: 'الأكثر مشاهدة',
  distance: 'الأقرب',
};

/** Quick-filter presets shown as horizontal chips above results. */
export interface QuickFilterPreset {
  id: string;
  label: string;
  /** Partial state to merge when the preset is tapped. */
  apply: Partial<SearchFilterState>;
  /** Optional: only show when current type matches. */
  types?: SearchType[];
}

export const QUICK_FILTER_PRESETS: QuickFilterPreset[] = [
  // GPS intentionally omitted — city-only location filtering
  {
    id: 'under-100',
    label: 'أقل من 100 ₪',
    apply: { maxPrice: 100 },
  },
  {
    id: 'under-50',
    label: 'أقل من 50 ₪',
    apply: { maxPrice: 50 },
  },
  {
    id: 'new',
    label: 'جديد',
    apply: { condition: 'NEW' },
    types: ['ads', 'all'],
  },
  {
    id: 'newest',
    label: 'الأحدث',
    apply: { sort: 'newest' },
  },
  {
    id: 'top-rated',
    label: 'أعلى تقييم',
    apply: { sort: 'rating' },
  },
];

/** Price range presets inside the filter sheet. */
export const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: 'أي سعر' },
  { label: 'أقل من 50', max: 50 },
  { label: '50 – 100', min: 50, max: 100 },
  { label: '100 – 250', min: 100, max: 250 },
  { label: '250 – 500', min: 250, max: 500 },
  { label: 'أكثر من 500', min: 500 },
];

export const DEFAULT_RADIUS_KM = 10;
export const MAX_RADIUS_KM = 100;
