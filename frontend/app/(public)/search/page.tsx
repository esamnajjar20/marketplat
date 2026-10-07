import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { SearchBox } from '@/components/search/SearchBox';
import { SearchTabsWrapper } from '@/components/search/SearchTabsWrapper';
import { SearchFilters } from '@/components/search/SearchFilters';
import { SearchFiltersSheet } from '@/components/search/SearchFiltersSheet';
import { SearchSortBarWrapper } from '@/components/search/SearchSortBarWrapper';
import { SearchResults } from '@/components/search/SearchResults';
import { SearchActiveFilters } from '@/components/search/SearchActiveFilters';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { WovenTexture } from '@/components/shared/ui/WovenTexture';

export const metadata: Metadata = buildMetadata({ title: 'البحث', noIndex: true });

interface Props {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Unified search page — extends the existing /search route (previously
 * ads-only) to cover ads + products + stores + service-listings behind
 * one input/tabs/filters/results set. /ads/search and the ads-only
 * SearchFilters/SearchResults/SearchInput trio are untouched — they're
 * still used by categories/[slug]/page.tsx for browsing a single ad
 * category, a genuinely different use case from this page.
 */
export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;

  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-8">
      <h1 className="sr-only">البحث</h1>
      {/*
        Same brand band treatment as the home hero (bg-primary, quiet
        woven texture) but compressed to a slim utility strip — enough
        to signal "you're still in سوق غزة", not enough to compete with
        the results below, which are the actual job of this page.
      */}
      <div className="relative bg-primary px-3 py-4 text-primary-foreground sm:px-4 sm:py-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <WovenTexture opacity={0.06} />
        </div>
        <div className="relative container mx-auto max-w-7xl space-y-3 sm:space-y-4">
          <Suspense>
            <SearchBox
              defaultValue={q ?? ''}
              inputClassName="bg-primary-foreground text-foreground"
            />
          </Suspense>
        </div>
      </div>

      <div id="search-results" className="container mx-auto space-y-4 px-3 pt-4 sm:space-y-6 sm:px-4 sm:pt-6">
        <Suspense>
          <SearchTabsWrapper />
        </Suspense>

        {/* FIX P1-2: on mobile, the filter panel used to render inline
            here — full-height, above every result — so a user had to
            scroll past category/city/sort controls before seeing a
            single match. Below `lg` that's now a "تصفية" trigger that
            opens the same SearchFilters in a bottom sheet instead;
            above `lg` the sheet trigger hides itself and the always-
            visible <aside> (now explicitly `hidden lg:block`, matching
            the shared browse-page breakpoint) takes over, unchanged from before. */}
        {/* FIX P2-08 (audit item #8): sort sits next to the filters
            trigger, independent of it, on every breakpoint — not nested
            inside the "تصفية" sheet/panel it used to live in. */}
        <div className="sticky top-[var(--header-height,4rem)] z-20 -mx-3 flex items-center gap-2 border-y border-border/60 bg-background/95 px-3 py-2 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <Suspense>
            <SearchFiltersSheet />
          </Suspense>
          <div className="flex-1 sm:flex-none sm:w-48 lg:ms-auto">
            <Suspense>
              <SearchSortBarWrapper />
            </Suspense>
          </div>
        </div>

        <Suspense>
          <SearchActiveFilters />
        </Suspense>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-4 lg:gap-6">
          <aside className="hidden lg:col-span-1 lg:block">
            <div className="sticky top-24">
              <Suspense>
              <SearchFilters />
            </Suspense>
            </div>
          </aside>
          <section id="search-results-panel" className="min-w-0 lg:col-span-3" role="tabpanel" aria-label="نتائج البحث">
            <Suspense
              fallback={
                <div className="flex justify-center py-12">
                  <LoadingSpinner />
                </div>
              }
            >
              <SearchResults />
            </Suspense>
          </section>
        </div>
      </div>
    </div>
  );
}
