'use client';

import { SearchSortBar } from '@/components/shared/SearchSortBar';
import { ROUTES, STORE_SORT_OPTIONS } from '@/lib/constants';

/** Thin URL-binding wrapper around the shared SearchSortBar for /stores. */
export function SearchSortBarWrapper() {
  return (
    <SearchSortBar
      basePath={ROUTES.stores}
      config={{
        mode: 'combined',
        options: STORE_SORT_OPTIONS,
        defaultSortBy: 'createdAt',
        defaultSortOrder: 'desc',
      }}
    />
  );
}
