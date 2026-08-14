'use client';

import { usePathname } from 'next/navigation';
import { SearchSortBar } from '@/components/shared/SearchSortBar';
import { AD_SORT_OPTIONS } from '@/lib/constants';

/**
 * Thin URL-binding wrapper around the shared SearchSortBar — needs its
 * own 'use client' boundary because the category page that renders it
 * (app/(public)/categories/[slug]/page.tsx) is a server component, and
 * FIX BUG-06's usePathname() convention (stay on the current page,
 * don't hardcode /search) only works client-side.
 */
export function SearchSortBarWrapper() {
  const pathname = usePathname();

  return (
    <SearchSortBar
      basePath={pathname}
      config={{
        mode: 'combined',
        options: AD_SORT_OPTIONS,
        defaultSortBy: 'createdAt',
        defaultSortOrder: 'desc',
      }}
    />
  );
}
