import type { Metadata } from 'next';
import { ListOrdered } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { SearchFilters } from '@/components/ads/SearchFilters';
import { SearchFiltersSheet } from '@/components/ads/SearchFiltersSheet';
import { SearchSortBarWrapper } from '@/components/ads/SearchSortBarWrapper';
import { SearchResults } from '@/components/ads/SearchResults';
import { ListPageShell } from '@/components/shared/list/ListPageShell';

// @418-FIX-v2: force-dynamic alone kept the Suspense fallbacks in the
// streamed HTML because useSearchParams() suspends during SSR. Removing
// the <Suspense> wrappers lets Next.js render the URL-sensitive parts
// as client-only (no server fallback), so there is no placeholder to
// mismatch on hydration. loading.tsx keeps the route-level shell UX.
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
