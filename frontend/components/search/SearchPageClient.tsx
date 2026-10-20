'use client';

import dynamic from 'next/dynamic';
import { WovenTexture } from '@/components/shared/ui/WovenTexture';

const SearchBox = dynamic(
  () => import('@/components/search/SearchBox').then((module) => module.SearchBox),
  { ssr: false, loading: () => <div className="h-11 animate-pulse rounded-xl bg-primary-foreground/20" aria-hidden="true" /> },
);
const SearchTabsWrapper = dynamic(
  () => import('@/components/search/SearchTabsWrapper').then((module) => module.SearchTabsWrapper),
  { ssr: false, loading: () => <div className="h-10 animate-pulse rounded-xl bg-muted" aria-hidden="true" /> },
);
const SearchFilters = dynamic(
  () => import('@/components/search/SearchFilters').then((module) => module.SearchFilters),
  { ssr: false, loading: () => <div className="min-h-20" aria-hidden="true" /> },
);
const SearchFiltersSheet = dynamic(
  () => import('@/components/search/SearchFiltersSheet').then((module) => module.SearchFiltersSheet),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const SearchSortBarWrapper = dynamic(
  () => import('@/components/search/SearchSortBarWrapper').then((module) => module.SearchSortBarWrapper),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const SearchResults = dynamic(
  () => import('@/components/search/SearchResults').then((module) => module.SearchResults),
  { ssr: false, loading: () => <div className="space-y-3 py-12" role="status" aria-live="polite"><p className="text-center text-sm text-muted-foreground">جارٍ تحميل نتائج البحث…</p><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-28 animate-pulse rounded-xl bg-muted" /></div> },
);
const SearchActiveFilters = dynamic(
  () => import('@/components/search/SearchActiveFilters').then((module) => module.SearchActiveFilters),
  { ssr: false, loading: () => <div className="min-h-8" aria-hidden="true" /> },
);

export function SearchPageClient({ query }: { query: string }) {
  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-8">
      <h1 className="sr-only">البحث</h1>
      <div className="relative bg-primary px-3 py-4 text-primary-foreground sm:px-4 sm:py-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"><WovenTexture opacity={0.06} /></div>
        <div className="relative container mx-auto max-w-7xl space-y-3 sm:space-y-4">
          <SearchBox key={query} defaultValue={query} inputClassName="bg-primary-foreground text-foreground" />
        </div>
      </div>
      <div id="search-results" className="container mx-auto space-y-4 px-3 pt-4 sm:space-y-6 sm:px-4 sm:pt-6">
        <SearchTabsWrapper />
        <div className="sticky top-[var(--header-height,4rem)] z-20 -mx-3 flex items-center gap-2 border-y border-border/60 bg-background/95 px-3 py-2 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <SearchFiltersSheet />
          <div className="flex-1 sm:flex-none sm:w-48 lg:ms-auto"><SearchSortBarWrapper /></div>
        </div>
        <SearchActiveFilters />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-4 lg:gap-6">
          <aside className="hidden lg:col-span-1 lg:block"><div className="sticky top-24"><SearchFilters /></div></aside>
          <section id="search-results-panel" className="min-w-0 lg:col-span-3" role="tabpanel" aria-label="نتائج البحث"><SearchResults /></section>
        </div>
      </div>
    </div>
  );
}
