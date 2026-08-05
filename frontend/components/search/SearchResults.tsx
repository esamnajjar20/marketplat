'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { UnifiedResultCard } from '@/components/search/UnifiedResultCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
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

  const q          = sp.get('q') ?? undefined;
  const city       = sp.get('city') ?? undefined;
  const type       = (sp.get('type') as SearchType) ?? 'all';
  const categoryId = sp.get('categoryId') ?? undefined;
  const sort       = (sp.get('sort') as SearchSort) ?? 'relevance';
  const page       = Number(sp.get('page') ?? 1);

  const { data, isLoading, isError, refetch } = useSearch({ q, city, type, categoryId, sort, page });

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
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
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
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="لا توجد نتائج"
          description={q ? `لم نجد نتائج لـ "${q}"` : 'لا توجد نتائج مطابقة لهذه الفلاتر'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
