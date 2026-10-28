/**
 * Filter analytics — uses existing SEARCH event + structured metadata
 * so no Prisma enum migration is required.
 *
 * Place at: frontend/lib/filterAnalytics.ts
 *
 * Metadata shape (all optional except action):
 *   action: 'filter_apply' | 'filter_reset' | 'quick_filter' | 'sheet_open'
 *         | 'save_preset' | 'apply_preset' | 'chip_clear'
 *   keys: string[]          — active filter keys
 *   type, city, categoryId, condition, sort, nearby, presetId, …
 */

import { track } from '@/lib/analytics';

export type FilterAnalyticsAction =
  | 'filter_apply'
  | 'filter_reset'
  | 'quick_filter'
  | 'sheet_open'
  | 'save_preset'
  | 'apply_preset'
  | 'chip_clear'
;

export interface FilterAnalyticsPayload {
  action: FilterAnalyticsAction;
  keys?: string[];
  type?: string;
  city?: string;
  categoryId?: string;
  condition?: string;
  sort?: string;
  nearby?: boolean;
  presetId?: string;
  presetLabel?: string;
  activeCount?: number;
  /** Extra free-form fields (kept small — backend caps metadata at 10KB). */
  [key: string]: unknown;
}

export function trackFilterEvent(payload: FilterAnalyticsPayload): void {
  track('SEARCH', {
    source: 'native_filters',
    ...payload,
  });
}
