import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { SearchBox } from '@/components/search/SearchBox';
import { SearchTabsWrapper } from '@/components/search/SearchTabsWrapper';
import { SearchFilters } from '@/components/search/SearchFilters';
import { SearchFiltersSheet } from '@/components/search/SearchFiltersSheet';
import { SearchResults } from '@/components/search/SearchResults';
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
    <div className="pb-8">
      {/*
        Same brand band treatment as the home hero (bg-primary, quiet
        woven texture) but compressed to a slim utility strip — enough
        to signal "you're still in سوق غزة", not enough to compete with
        the results below, which are the actual job of this page.
      */}
      <div className="relative overflow-hidden bg-primary px-4 py-6 text-primary-foreground">
        <WovenTexture opacity={0.06} />
        <div className="relative container mx-auto space-y-4">
          <Suspense>
            <SearchBox
              defaultValue={q ?? ''}
              inputClassName="bg-primary-foreground text-foreground"
            />
          </Suspense>
        </div>
      </div>

      <div className="container mx-auto space-y-6 px-4 pt-6">
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
            the audit's suggested fix) takes over, unchanged from before. */}
        <Suspense>
          <SearchFiltersSheet />
        </Suspense>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="hidden lg:col-span-1 lg:block">
            <Suspense>
              <SearchFilters />
            </Suspense>
          </aside>
          <main className="lg:col-span-3">
            <Suspense
              fallback={
                <div className="flex justify-center py-12">
                  <LoadingSpinner />
                </div>
              }
            >
              <SearchResults />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
