import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Store } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { StoresGrid } from '@/components/stores/StoresGrid';
import { StoresFilters } from '@/components/stores/StoresFilters';
import { StoresFiltersSheet } from '@/components/stores/StoresFiltersSheet';
import { SearchSortBarWrapper } from '@/components/stores/SearchSortBarWrapper';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export const metadata: Metadata = buildMetadata({ title: 'المتاجر', path: '/stores' });

export default function StoresPage() {
  return (
    <div className="pb-8">
      {/*
        Design pass: previously a bare <h1> + grid with no filter UI at
        all (BUG-02) and no visual identity distinct from any other
        list page. Matches the header treatment /categories/[slug] uses
        — an icon-badge + heading pair — instead of a plain text title,
        and now has a real filter sidebar (StoresFilters) so the
        search/city/sort the grid already
        supports is actually reachable.
      */}
      <div className="border-b bg-secondary/40">
        <div className="container mx-auto flex items-center gap-3 px-4 py-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">المتاجر</h1>
            <p className="text-sm text-muted-foreground">تصفح متاجر البائعين الموثّقين في سوق غزة</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pt-6 space-y-6">
        {/* FIX P2-09: on mobile, StoresFilters used to render inline
            here — full-height, above every result — so a user had to
            scroll past search/city controls before seeing a single
            store. Below `lg` that's now a "تصفية" trigger that opens
            the same StoresFilters in a bottom sheet instead; above
            `lg` the sheet trigger hides itself and the always-visible
            <aside> (now explicitly `hidden lg:block`, mirroring
            /search and the ads category page) takes over. */}
        {/* FIX P2-08 (audit item #8): sort independent of the filters
            trigger/panel on every breakpoint. */}
        <div className="flex items-center gap-2">
          <Suspense>
            <StoresFiltersSheet />
          </Suspense>
          <div className="flex-1 sm:flex-none sm:w-48 lg:ms-auto">
            <Suspense>
              <SearchSortBarWrapper />
            </Suspense>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="hidden lg:col-span-1 lg:block">
            <Suspense><StoresFilters /></Suspense>
          </aside>
          <main className="lg:col-span-3">
            <Suspense fallback={<PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز القائمة…" />}>
              <StoresGrid />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
