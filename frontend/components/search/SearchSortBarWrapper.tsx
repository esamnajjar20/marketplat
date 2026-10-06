'use client';

import { useSearchParams } from 'next/navigation';
import { SearchSortBar } from '@/components/shared/SearchSortBar';
import { ROUTES } from '@/lib/constants';

const SORT_LABELS: Record<string, string> = {
  relevance: 'الأكثر تطابقاً',
  rating: 'الأعلى تقييماً',
  newest: 'الأحدث',
  views: 'الأكثر مشاهدة',
  price_asc: 'السعر: الأقل أولاً',
  price_desc: 'السعر: الأعلى أولاً',
};

// TRACK-NEARBY-SEARCH: separate from SORT_LABELS above — 'distance'
// is only ever a valid choice once lat/lng are on the URL (see
// searchQuerySchema's .refine() on the backend), so it's appended to
// the option list conditionally below instead of always being present
// like the other four. Moved here unchanged from SearchFilters.tsx
// () — same values, same condition, just relocated.
const DISTANCE_SORT_LABEL = 'الأقرب';

/**
 * Thin URL-binding wrapper around the shared SearchSortBar — same
 * "own the URL wiring, keep the shared piece presentational" split
 * SearchTabsWrapper already uses for SearchTabs.
 */
export function SearchSortBarWrapper() {
  const sp = useSearchParams();
  const hasGeo = sp.get('lat') !== null && sp.get('lng') !== null;

  const options = [
    ...Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label })),
    ...(hasGeo ? [{ value: 'distance', label: DISTANCE_SORT_LABEL }] : []),
  ];

  return (
    <SearchSortBar
      basePath={ROUTES.search}
      config={{ mode: 'single', paramKey: 'sort', defaultValue: 'relevance', options }}
    />
  );
}
