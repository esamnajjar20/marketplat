import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ListOrdered } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { SearchFilters } from '@/components/ads/SearchFilters';
import { SearchFiltersSheet } from '@/components/ads/SearchFiltersSheet';
import { SearchSortBarWrapper } from '@/components/ads/SearchSortBarWrapper';
import { SearchResults } from '@/components/ads/SearchResults';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'الإعلانات', path: '/ads' });

/**
 * ADD-ADS-PAGE: standalone public browse page for ads — previously the
 * only ways to reach the ads-only SearchFilters/SearchResults/
 * SearchSortBarWrapper trio were /categories/[slug] (single category,
 * see that page) or the unified /search?type=ads tab (mixed with
 * products/stores/services, no dedicated filter chrome). This gives
 * ads the same "dedicated page" treatment /products and /stores
 * already have — same icon-badge + heading header, same
 * filters-sheet/sort-bar toolbar, same 4-col sidebar+grid layout.
 *
 * No categorySlug prop passed to any of the three components below —
 * see ads/SearchResults.tsx's FIX ADS-PAGE-01 comment for the base-URL
 * fix that made rendering them with no category safe (pagination/reset
 * used to hardcode ROUTES.search, which would have silently redirected
 * users off this page).
 */
export default function AdsPage() {
  return (
    <div className="pb-8">
      <div className="border-b bg-secondary/40">
        <div className="container mx-auto flex items-center gap-3 px-4 py-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListOrdered className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">الإعلانات</h1>
            <p className="text-sm text-muted-foreground">تصفح كل الإعلانات المنشورة في سوق غزة</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pt-6 space-y-6">
        <div className="flex items-center gap-2">
          <Suspense>
            <SearchFiltersSheet />
          </Suspense>
          <div className="flex-1 sm:flex-none sm:w-48 lg:ms-auto">
            <Suspense>
              <SearchSortBarWrapper />
            </Suspense>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="hidden lg:col-span-1 lg:block">
            <Suspense><SearchFilters /></Suspense>
          </aside>
          <main className="lg:col-span-3">
            <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
              <SearchResults />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
