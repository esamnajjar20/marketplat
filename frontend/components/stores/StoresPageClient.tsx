'use client';

import dynamic from 'next/dynamic';
import { Store } from 'lucide-react';
import { ListPageShell } from '@/components/shared/list/ListPageShell';

const StoresGrid = dynamic(
  () => import('@/components/stores/StoresGrid').then((module) => module.StoresGrid),
  { ssr: false, loading: () => <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div> },
);
const StoresFilters = dynamic(
  () => import('@/components/stores/StoresFilters').then((module) => module.StoresFilters),
  { ssr: false, loading: () => <div className="min-h-20" aria-hidden="true" /> },
);
const StoresFiltersSheet = dynamic(
  () => import('@/components/stores/StoresFiltersSheet').then((module) => module.StoresFiltersSheet),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const SearchSortBarWrapper = dynamic(
  () => import('@/components/stores/SearchSortBarWrapper').then((module) => module.SearchSortBarWrapper),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);

export function StoresPageClient() {
  return (
    <ListPageShell
      icon={<Store className="h-6 w-6" />}
      title="المتاجر"
      description="تصفح متاجر البائعين الموثّقين في سوق غزة"
      toolbar={
        <>
          <StoresFiltersSheet />
          <div className="min-w-0 flex-1 sm:flex-none sm:w-48 lg:ms-auto"><SearchSortBarWrapper /></div>
        </>
      }
      sidebar={<StoresFilters />}
    >
      <StoresGrid />
    </ListPageShell>
  );
}
