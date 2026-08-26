'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { AdCard }         from '@/components/ads/AdCard';
import { AdListItem }     from '@/components/ads/AdListItem';
import { AdCardSkeleton, AdListItemSkeleton } from '@/components/shared/skeletons';
import { Pagination }     from '@/components/shared/ui/Pagination';
import { EmptySearchSuggestions } from '@/components/search/EmptySearchSuggestions';
import { EmptyState }     from '@/components/shared/feedback/EmptyState';
import { Button }        from '@/components/shared/ui/Button';
import { useAds, useSearchAds } from '@/hooks/queries/useAds';
import { SaveSearchButton } from '@/components/ads/SaveSearchButton';
import { ROUTES } from '@/lib/constants';
import { useCategoryBySlug } from '@/hooks/queries/useCategories';
import type { AdSortField } from '@/types/ad.types';
import { LayoutGrid, LayoutList, Search } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /**
   * FIX BUG-01: when SearchResults is rendered from the category page
   * (app/(public)/categories/[slug]/page.tsx), the category was never
   * actually applied as a filter — this component only ever read
   * `categoryId` from the URL's query string, which the category route
   * never sets (the slug lives in the *path*, not a `?categoryId=`
   * param). The grid silently fell back to the full, unfiltered browse
   * query — visually identical to /search, so nothing looked "broken"
   * at a glance even though the category filter did nothing.
   *
   * Passing the slug down explicitly and resolving it to an id here
   * (via the already-prefetched useCategoryBySlug) means the category
   * page's own filter no longer depends on a query param nobody sets.
   */
  categorySlug?: string;
}

export function SearchResults({ categorySlug }: Props = {}) {
  const sp   = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const { data: slugCategory } = useCategoryBySlug(categorySlug ?? '');

  const q          = sp.get('q') ?? '';
  const page       = Number(sp.get('page') ?? 1);
  // An explicit ?categoryId= in the URL (e.g. a sub-filter picked from
  // SearchFilters while already on the category page) takes precedence
  // over the route's own slug so users can still narrow further.
  const categoryId = sp.get('categoryId') ?? slugCategory?.id ?? undefined;
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

  const hasActiveFilters = Boolean(
    categoryId || city || condition || minPrice != null || maxPrice != null ||
    (sortBy && sortBy !== 'createdAt') || (sortOrder && sortOrder !== 'desc')
  );

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

  // FIX UX-04: was a single centered LoadingSpinner that replaced the
  // entire results area — jarring specifically on /search, since this
  // is the one page in the app where AdCard-shaped skeletons already
  // existed (home's FeaturedAds/RecentAds) but weren't reused here.
  // Picks AdCardSkeleton or AdListItemSkeleton to match whichever view
  // the user currently has selected, so a filter change or page
  // navigation doesn't visually snap between two different layouts.
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        {view === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 9 }).map((_, i) => <AdCardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <AdListItemSkeleton key={i} />)}
          </div>
        )}
      </div>
    );
  }
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
        <div className="flex items-center gap-2">
          <SaveSearchButton />
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
      </div>

      {/* Results */}
      {items.length === 0 ? (
        <>
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="لا توجد إعلانات"
          description={q ? `لم نجد نتائج لـ «${q}». جرّب كلمة أقصر أو غيّر المدينة أو امسح الفلاتر.` : 'لا توجد إعلانات مطابقة. جرّب توسيع البحث أو تصفّح التصنيفات.'}
          action={
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              {(hasActiveFilters || q) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (hasActiveFilters && q) {
                      router.push(`${ROUTES.search}?q=${encodeURIComponent(q)}`);
                    } else {
                      router.push(ROUTES.search);
                    }
                  }}
                >
                  {hasActiveFilters ? 'مسح الفلاتر' : 'عرض كل الإعلانات'}
                </Button>
              )}
              <Button variant="default" size="sm" asChild>
                <Link href={ROUTES.home}>العودة للرئيسية</Link>
              </Button>
            </div>
          }
        />
        <EmptySearchSuggestions />
        </>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 stagger-fade-in">
          {items.map((ad) => <AdCard key={ad.id} ad={ad} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((ad) => <AdListItem key={ad.id} ad={ad} />)}
        </div>
      )}

      {totalPages > 1 && page < totalPages && (
        <div className="flex flex-col items-center gap-2 pt-2 sm:hidden">
          <button
            type="button"
            className="min-h-[48px] w-full max-w-sm rounded-full border bg-card px-6 py-3 text-sm font-medium shadow-sm hover:bg-muted"
            onClick={() => {
              const params = new URLSearchParams(sp.toString());
              params.set('page', String(page + 1));
              const base = categorySlug ? ROUTES.category(categorySlug) : ROUTES.search;
              router.push(`${base}?${params.toString()}`);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            عرض المزيد — الصفحة {page + 1} من {totalPages}
          </button>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          baseUrl={categorySlug ? ROUTES.category(categorySlug) : ROUTES.search}
          searchParams={searchParams} />
      )}
    </div>
  );
}
