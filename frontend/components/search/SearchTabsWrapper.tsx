'use client';

import { useSearchParams } from 'next/navigation';
import { writeClientUrl } from '@/lib/urlWithParams';
import { SearchTabs } from '@/components/search/SearchTabs';
import { ROUTES } from '@/lib/constants';
import type { SearchType } from '@/types/search.types';

/**
 * Thin URL-binding wrapper around the presentational SearchTabs —
 * kept separate so SearchTabs itself stays a plain controlled
 * component (easy to unit test / reuse elsewhere later) while this
 * piece owns the "type lives in the URL" wiring, same split
 * SearchFilters/SearchResults already use for their own URL params.
 */
export function SearchTabsWrapper() {
  const sp = useSearchParams();
  const type = (sp.get('type') as SearchType) ?? 'all';

  function handleChange(next: SearchType) {
    const params = new URLSearchParams(sp.toString());
    if (next === 'all') params.delete('type');
    else params.set('type', next);
    // A categoryId picked under the previous tab's taxonomy can't
    // carry over — see SearchFilters.tsx's identical guard on its own
    // type change for the full rationale.
    params.delete('categoryId');
    params.delete('page');
    writeClientUrl(`${ROUTES.search}?${params.toString()}`, 'push');
  }

  return <SearchTabs value={type} onChange={handleChange} />;
}
