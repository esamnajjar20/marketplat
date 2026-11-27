'use client';

import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { SearchTabs } from '@/components/search/SearchTabs';
import { ROUTES } from '@/lib/constants';
import type { SearchType } from '@/types/search.types';
import { parseFilterEnum } from '../../../shared/filters';

/**
 * Thin URL-binding wrapper around the presentational SearchTabs —
 * kept separate so SearchTabs itself stays a plain controlled
 * component (easy to unit test / reuse elsewhere later) while this
 * piece owns the "type lives in the URL" wiring, same split
 * SearchFilters/SearchResults already use for their own URL params.
 */
export function SearchTabsWrapper() {
  const filters = useUnifiedFilters({ basePath: ROUTES.search, profile: 'globalSearch', mode: 'push' });
  const type = parseFilterEnum(filters.get('type'), ['ads', 'products', 'stores', 'services'] as const) ?? 'all';

  function handleChange(next: SearchType) {
    // A category selected in the previous content taxonomy cannot carry over.
    filters.updateMany({ type: next === 'all' ? null : next, categoryId: null }, { mode: 'push' });
  }

  return <SearchTabs value={type} onChange={handleChange} />;
}
