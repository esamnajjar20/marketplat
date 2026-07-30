'use client';

import { useSearchParams } from 'next/navigation';
import { AdCard }         from '@/components/ads/AdCard';
import { AdListItem }     from '@/components/ads/AdListItem';
import { Pagination }     from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState }     from '@/components/shared/feedback/EmptyState';
import { useAds, useSearchAds } from '@/hooks/queries/useAds';
import { ROUTES } from '@/lib/constants';
import type { AdSortField } from '@/types/ad.types';
import { LayoutGrid, LayoutList, Search } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function SearchResults() {
  const sp   = useSearchParams();
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const q          = sp.get('q') ?? '';
  const page       = Number(sp.get('page') ?? 1);
  const categoryId = sp.get('categoryId') ?? undefined;
  const city       = sp.get('city') ?? undefined;
  const condition  = sp.get('condition') as 'NEW' | 'USED' | 'REFURBISHED' | undefined;
  const minPrice   = sp.get('minPrice') ? Number(sp.get('minPrice')) : undefined;
  const maxPrice   = sp.get('maxPrice') ? Number(sp.get('maxPrice')) : undefined;
  // L-4 (audit fix): was hardcoded as 'createdAt' | 'price', excluding
  // 'views' even though AD_SORT_OPTIONS (lib/constants.ts) already
  // offers a "الأكثر مشاهدة" (Most Viewed) option that sets
  // sortBy=views, and the backend has supported it since FIX H-1. That
  // mismatch meant selecting "Most Viewed" put a value in the URL this
  // component's own type didn't believe was possible — TypeScript
  // wasn't catching it only because of the `as` cast. Importing the
  // shared AdSortField type (same one ad.types.ts and constants.ts
  // already use) instead of re-declaring the union here means this
  // can't drift from those again.
  const sortBy     = (sp.get('sortBy') as AdSortField) ?? 'createdAt';
  const sortOrder  = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';

  // NOTE: kept at >= 2 to match useSearchAds' own `enabled` guard (see
  // useAds.ts) and the pinned test contract — a query shorter than 2
  // trimmed characters falls back to the unfiltered browse query
  // instead of firing a dedicated search request.
  const isSearch   = q.trim().length >= 2;
  const searchQ    = useSearchAds({ q, page, categoryId, city, condition, minPrice, maxPrice, sortBy, sortOrder });
  // FIX PERF-04: only fire the browse query when we're NOT doing a
  // real search — otherwise this fired in parallel with useSearchAds
  // on every keystroke-driven search, wasting a full GET /ads request
  // whose result was never even read (see useAds.ts).
  const browseQ    = useAds({ page, categoryId, city, condition, minPrice, maxPrice, sortBy, sortOrder }, { enabled: !isSearch });
  const { data, isLoading, isError, refetch } = isSearch ? searchQ : browseQ;

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const total      = data?.meta?.total ?? 0;

  const searchParams = Object.fromEntries(sp.entries());

  if (isLoading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  if (isError) {
    // UX-FIX P1-4: previously just a static line of red text with no way
    // to recover short of a full page reload, even on a transient network
    // blip. Mirrors the retry pattern already used in app/offline/page.tsx.
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-destructive">حدث خطأ أثناء تحميل الإعلانات</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total > 0 ? `${total} إعلان` : 'لا توجد نتائج'}
          {q && <> بحثاً عن «<span className="font-medium text-foreground">{q}</span>»</>}
        </p>
        <div className="flex gap-1" role="group" aria-label="طريقة العرض">
          <button onClick={() => setView('grid')}
            aria-label="عرض شبكي" aria-pressed={view === 'grid'}
            className={cn('p-1.5 rounded', view === 'grid' ? 'bg-muted' : 'hover:bg-muted/50')}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button onClick={() => setView('list')}
            aria-label="عرض قائمة" aria-pressed={view === 'list'}
            className={cn('p-1.5 rounded', view === 'list' ? 'bg-muted' : 'hover:bg-muted/50')}>
            <LayoutList className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Results */}
      {items.length === 0 ? (
        <EmptyState icon={<Search className="h-10 w-10" />}
          title="لا توجد إعلانات"
          description={q ? `لم نجد نتائج لـ "${q}"` : 'لا توجد إعلانات مطابقة لهذه الفلاتر'} />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((ad) => <AdCard key={ad.id} ad={ad} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((ad) => <AdListItem key={ad.id} ad={ad} />)}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          baseUrl={ROUTES.search} searchParams={searchParams} />
      )}
    </div>
  );
}
