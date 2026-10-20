'use client';

import dynamic from 'next/dynamic';
import { ListOrdered } from 'lucide-react';
import { ListPageShell } from '@/components/shared/list/ListPageShell';

const SearchFilters = dynamic(
  () => import('@/components/ads/SearchFilters').then((module) => module.SearchFilters),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const SearchFiltersSheet = dynamic(
  () => import('@/components/ads/SearchFiltersSheet').then((module) => module.SearchFiltersSheet),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const SearchSortBarWrapper = dynamic(
  () => import('@/components/ads/SearchSortBarWrapper').then((module) => module.SearchSortBarWrapper),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const SearchResults = dynamic(
  () => import('@/components/ads/SearchResults').then((module) => module.SearchResults),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 py-4" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">جارٍ تحميل الإعلانات…</p>
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
      </div>
    ),
  },
);

/**
 * URL- and browser-cache-driven widgets are mounted only on the client.
 * This keeps server HTML deterministic and prevents placeholder/cache races
 * from producing React #418 on /ads during hydration.
 */
export function AdsPageClient() {
  return (
    <ListPageShell
      icon={<ListOrdered className="h-6 w-6" />}
      title="الإعلانات"
      description="تصفح كل الإعلانات المنشورة في سوق غزة"
      toolbar={
        <>
          <SearchFiltersSheet />
          <div className="min-w-0 flex-1 sm:flex-none sm:w-48 lg:ms-auto">
            <SearchSortBarWrapper />
          </div>
        </>
      }
      sidebar={<SearchFilters />}
    >
      <SearchResults />
    </ListPageShell>
  );
}
