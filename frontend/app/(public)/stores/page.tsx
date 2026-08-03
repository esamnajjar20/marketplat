import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Store } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { StoresGrid } from '@/components/stores/StoresGrid';
import { StoresFilters } from '@/components/stores/StoresFilters';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'المتاجر', path: '/stores' });

export default function StoresPage() {
  return (
    <div className="pb-8">
      {/*
        Design pass: previously a bare <h1> + grid with no filter UI at
        all (BUG-02) and no visual identity distinct from any other
        list page. Matches the header treatment /categories/[slug] and
        /services already use — an icon-badge + heading pair — instead
        of a plain text title, and now has a real filter sidebar
        (StoresFilters) so the search/city/sort the grid already
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

      <div className="container mx-auto px-4 pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1">
            <Suspense><StoresFilters /></Suspense>
          </aside>
          <main className="lg:col-span-3">
            <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
              <StoresGrid />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
