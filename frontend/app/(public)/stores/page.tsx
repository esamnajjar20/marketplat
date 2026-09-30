import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Store } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { StoresGrid } from '@/components/stores/StoresGrid';
import { StoresFilters } from '@/components/stores/StoresFilters';
import { StoresFiltersSheet } from '@/components/stores/StoresFiltersSheet';
import { SearchSortBarWrapper } from '@/components/stores/SearchSortBarWrapper';
import { ListPageShell } from '@/components/shared/list/ListPageShell';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export const metadata: Metadata = buildMetadata({ title: 'المتاجر', path: '/stores' });

export default function StoresPage() {
  return (
    <ListPageShell
      icon={<Store className="h-6 w-6" />}
      title="المتاجر"
      description="تصفح متاجر البائعين الموثّقين في سوق غزة"
      toolbar={
        <>
          <Suspense>
            <StoresFiltersSheet />
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
          <StoresFilters />
        </Suspense>
      }
    >
      <Suspense
        fallback={
          <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز القائمة…" />
        }
      >
        <StoresGrid />
      </Suspense>
    </ListPageShell>
  );
}
