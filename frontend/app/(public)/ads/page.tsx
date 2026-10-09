import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ListOrdered } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { SearchFilters } from '@/components/ads/SearchFilters';
import { SearchFiltersSheet } from '@/components/ads/SearchFiltersSheet';
import { SearchSortBarWrapper } from '@/components/ads/SearchSortBarWrapper';
import { SearchResults } from '@/components/ads/SearchResults';
import { ListPageShell } from '@/components/shared/list/ListPageShell';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

// @418-FIX: static prerender of a sync page with useSearchParams inside
// <Suspense> produces a fallback shell (loading.tsx + inline fallbacks)
// that cannot be reconciled on the client — React #418 (args[]=HTML).
// Force per-request render so server HTML matches the client tree exactly.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({ title: 'الإعلانات', path: '/ads' });

export default function AdsPage() {
  return (
    <ListPageShell
      icon={<ListOrdered className="h-6 w-6" />}
      title="الإعلانات"
      description="تصفح كل الإعلانات المنشورة في سوق غزة"
      toolbar={
        <>
          <Suspense>
            <SearchFiltersSheet />
          </Suspense>
          <div className="min-w-0 flex-1 sm:flex-none sm:w-48 lg:ms-auto">
            <Suspense>
              <SearchSortBarWrapper />
            </Suspense>
          </div>
        </>
      }
      sidebar={
        <Suspense>
          <SearchFilters />
        </Suspense>
      }
    >
      <Suspense
        fallback={
          <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز الإعلانات…" />
        }
      >
        <SearchResults />
      </Suspense>
    </ListPageShell>
  );
}
