'use client';

import dynamic from 'next/dynamic';
import { DesktopOnly } from '@/components/shared/layout/DesktopOnly';
import { Suspense } from 'react';

const SearchBox = dynamic(
  () => import('@/components/search/SearchBox').then((module) => module.SearchBox),
  { ssr: false, loading: () => <div className="h-12 animate-pulse rounded-full bg-muted" aria-hidden="true" /> },
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
  {
    loading: () => (
      <div className="space-y-3 py-8" role="status" aria-live="polite">
        <p className="text-center text-sm text-muted-foreground">جارٍ تحميل نتائج البحث…</p>
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    ),
  },
);
const SearchActiveFilters = dynamic(
  () => import('@/components/search/SearchActiveFilters').then((module) => module.SearchActiveFilters),
  { ssr: false, loading: () => <div className="min-h-8" aria-hidden="true" /> },
);

/**
 * صفحة البحث — مطابقة لتصاميم المرجع (بداية / نتائج / فارغ / بدون اتصال).
 */
export function SearchPageClient({ query, pageSize = 10 }: { query: string; pageSize?: number }) {
  return (
    <div className="bg-[var(--legacy-page-surface)] pb-0 dark:bg-background md:pb-8">
      <h1 className="sr-only">البحث</h1>
      <div className="container mx-auto max-w-7xl space-y-3 px-3 pt-4 sm:space-y-4 sm:px-4 sm:pt-6">
        <SearchBox key={query} defaultValue={query} />
        <SearchTabsWrapper />
        <div className="flex flex-wrap items-center gap-2">
          <SearchFiltersSheet />
          <div className="min-w-0 flex-1 sm:max-w-[12rem] sm:flex-none lg:ms-auto">
            <SearchSortBarWrapper />
          </div>
        </div>
        <SearchActiveFilters />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-4 lg:gap-6">
          <aside className="hidden lg:col-span-1 lg:block">
            <div className="sticky top-24">
              <DesktopOnly><SearchFilters /></DesktopOnly>
            </div>
          </aside>
          <section
            id="search-results-panel"
            className="min-w-0 lg:col-span-3"
            role="tabpanel"
            aria-label="نتائج البحث"
          >
            <Suspense fallback={<div className="min-h-40" aria-hidden="true" />}><SearchResults pageSize={pageSize} /></Suspense>
          </section>
        </div>
      </div>
    </div>
  );
}
