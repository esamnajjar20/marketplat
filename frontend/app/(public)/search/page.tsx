import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { SearchBox } from '@/components/search/SearchBox';
import { SearchTabsWrapper } from '@/components/search/SearchTabsWrapper';
import { SearchFilters } from '@/components/search/SearchFilters';
import { SearchResults } from '@/components/search/SearchResults';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

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
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, currentColor 0, currentColor 1px, transparent 1px, transparent 14px)',
          }}
        />
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1">
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
