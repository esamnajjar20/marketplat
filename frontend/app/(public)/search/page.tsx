import type { Metadata } from 'next';
import { Suspense }      from 'react';
import { buildMetadata } from '@/lib/seo';
import { SearchInput }   from '@/components/ads/SearchInput';
import { SearchFilters } from '@/components/ads/SearchFilters';
import { SearchResults } from '@/components/ads/SearchResults';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'البحث', noIndex: true });

export default function SearchPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <SearchInput />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1">
          <Suspense>
            <SearchFilters />
          </Suspense>
        </aside>
        <main className="lg:col-span-3">
          <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
            <SearchResults />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
