'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { UnifiedResultCard } from '@/components/search/UnifiedResultCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { useSearch } from '@/hooks/queries/useSearch';
import { ROUTES } from '@/lib/constants';
import { track } from '@/lib/analytics';
import type { SearchSort, SearchType } from '@/types/search.types';

/**
 * Unified results grid — reads q/city/type/categoryId/sort/page
 * straight from the URL (same "URL is the source of truth" convention
 * SearchResults.tsx already uses for the ads-only search page), so
 * SearchTabs/city filter/sort control all just push a new URL rather
 * than lifting shared state up through props.
 */
export function SearchResults() {
  const sp = useSearchParams();
  const router = useRouter();

  const q          = sp.get('q') ?? undefined;
  const city       = sp.get('city') ?? undefined;
  const type       = (sp.get('type') as SearchType) ?? 'all';
  const categoryId = sp.get('categoryId') ?? undefined;
  const sort       = (sp.get('sort') as SearchSort) ?? 'relevance';
  const page       = Number(sp.get('page') ?? 1);
  // TRACK-NEARBY-SEARCH: lat/lng/radius live in the URL like every
  // other filter on this page (SearchNearbyToggle writes them via
  // router.push, the same "URL is the source of truth" convention
  // SearchFilters/SearchTabsWrapper already use) — unlike
  // NearbyServiceProviders.tsx's local useState, this page's filters/
  // sort/pagination are already URL-driven, so geo belongs there too
  // rather than introducing a second, inconsistent state mechanism.
  const latParam    = sp.get('lat');
  const lngParam    = sp.get('lng');
  const lat         = latParam !== null ? Number(latParam) : undefined;
  const lng         = lngParam !== null ? Number(lngParam) : undefined;
  const radiusParam = sp.get('radius');
  const radius      = radiusParam !== null ? Number(radiusParam) : undefined;

  // UX-FIX (audit P2-02): mirrors exactly what SearchFilters.tsx's own
  // reset button clears (city/categoryId/sort/geo — q is deliberately
  // preserved by that button, so it's not "active" in this sense).
  const hasActiveFilters = Boolean(city || categoryId || (sort && sort !== 'relevance') || lat !== undefined);

  const { data, isLoading, isError, refetch } = useSearch({
    q, city, type, categoryId, sort, page, lat, lng, radius,
  });

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const total      = data?.meta?.total ?? 0;

  const searchParams = Object.fromEntries(sp.entries());

  // Gap #7 (product analytics): fires once per resolved query — depends
  // on the actual query params (not `data`) so it doesn't re-fire on
  // background refetches of the same search, only when the visitor
  // issues a (possibly) different one. Only tracks non-empty queries —
  // landing on /search with no `q` yet isn't a search event.
  useEffect(() => {
    if (q) track('SEARCH', { q, city, type, categoryId, resultCount: data?.meta?.total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, city, type, categoryId, page]);

  if (isLoading) {
    // FIX AUDIT-2: was a single centered LoadingSpinner that replaced
    // the whole results area, discarding the grid shape on every
    // filter/page/search change — the older ads-only SearchResults.tsx
    // already reuses AdCardSkeleton for exactly this; UnifiedResultCard
    // shares that same outer shape (rounded-xl border bg-card), so the
    // same skeleton fits here without introducing a new one.
    return (
      <div className="space-y-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => <AdCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-destructive">حدث خطأ أثناء تحميل النتائج</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total > 0 ? `${total} نتيجة` : 'لا توجد نتائج'}
        {q && (
          <>
            {' '}
            بحثاً عن «<span className="font-medium text-foreground">{q}</span>»
          </>
        )}
      </p>

      {items.length === 0 ? (
        // UX-FIX (audit P2-02): SearchFilters.tsx already has a working
        // reset button (clears city/categoryId/sort/geo, keeps q), but
        // it wasn't surfaced here where a filtered-to-zero result
        // actually lands — a user had to scroll to the filter panel/
        // sheet themselves. hasActiveFilters mirrors exactly what that
        // reset button clears, so the action only appears when there's
        // something for it to actually do.
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="لا توجد نتائج"
          description={q ? `لم نجد نتائج لـ "${q}"` : 'لا توجد نتائج مطابقة لهذه الفلاتر'}
          action={
            hasActiveFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(q ? `${ROUTES.search}?q=${encodeURIComponent(q)}` : ROUTES.search)}
              >
                مسح الفلاتر
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 stagger-fade-in">
          {items.map((result) => (
            <UnifiedResultCard key={`${result.type}-${result.id}`} result={result} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.search}
          searchParams={searchParams}
        />
      )}
    </div>
  );
}
