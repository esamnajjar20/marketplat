'use client';

import { OfflineQueryFallback } from '@/components/shared/feedback/OfflineQueryFallback';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ListDataStatus } from '@/components/shared/feedback/ListDataStatus';
import { useInfiniteQuery } from '@tanstack/react-query';

import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { AdCard }         from '@/components/ads/AdCard';
import { AdListItem }     from '@/components/ads/AdListItem';
import { AdCardSkeleton, AdListItemSkeleton } from '@/components/shared/skeletons';
import { EmptySearchSuggestions } from '@/components/search/EmptySearchSuggestions';
import { EmptyState }     from '@/components/shared/feedback/EmptyState';
import { Button }        from '@/components/shared/ui/Button';
import { adsApi } from '@/api/ads.api';
import { SaveSearchButton } from '@/components/ads/SaveSearchButton';
import { ROUTES } from '@/lib/constants';
import { useCategoryBySlug } from '@/hooks/queries/useCategories';
import type { AdSortField } from '@/types/ad.types';
import { LayoutGrid, LayoutList, Search } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LIST_CARD_GRID_CLASS } from '@/components/shared/list/ListPageShell';
import { InfiniteScrollTrigger } from '@/components/shared/list/InfiniteScrollTrigger';
import { useNetworkPolicy } from '@/hooks/useNetworkPolicy';
import { getAdaptivePageSize } from '@/lib/networkPolicy';

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
  const isOnline = useOnlineStatus();
  const sp   = useSearchParams();
  const router = useRouter();
  // FIX ADS-PAGE-01: mirrors BUG-06 below (SearchFilters.tsx/
  // SearchSortBarWrapper.tsx already do this) — every base-URL fallback
  // in this file used to hardcode ROUTES.search whenever categorySlug
  // was absent, which was correct only because the sole other caller of
  // this component with no categorySlug was /search itself. Now that
  // app/(public)/ads/page.tsx also renders this component with no
  // categorySlug, that assumption breaks: pagination, "load more", and
  // the empty-state reset buttons would silently redirect a /ads user
  // to /search instead of staying on /ads. Reading the actual current
  // path (same convention already established here for the category
  // case) fixes both callers at once without a new prop.
  const pathname = usePathname();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const { data: slugCategory } = useCategoryBySlug(categorySlug ?? '');

  const q          = sp.get('q') ?? '';
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
  const isSearch = q.trim().length >= 2;
  const networkPolicy = useNetworkPolicy();
  const pageSize = getAdaptivePageSize(12, networkPolicy);

  const infiniteQuery = useInfiniteQuery({
    queryKey: ['ads', 'infinite', isSearch ? 'search' : 'browse', { q: isSearch ? q : undefined, categoryId, city, condition, minPrice, maxPrice, sortBy, sortOrder, pageSize }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      if (isSearch) {
        return adsApi.searchAds({ q, page: pageParam, limit: pageSize, categoryId, city, condition, minPrice, maxPrice, sortBy, sortOrder }).then((r) => r.data.data);
      }
      return adsApi.getAll({ page: pageParam, limit: pageSize, categoryId, city, condition, minPrice, maxPrice, sortBy, sortOrder })
        .then((r) => r.data.data);
    },
    getNextPageParam: (lastPage) => lastPage?.meta?.hasNextPage ? lastPage.meta.page + 1 : undefined,
  });
  const { data, isLoading, isFetching, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = infiniteQuery;
  const items = data?.pages.flatMap((pageData) => pageData?.items ?? []) ?? [];
  const total = data?.pages[0]?.meta?.total ?? items.length;
  const loadMore = () => { void fetchNextPage(); };


  // FIX UX-04: was a single centered LoadingSpinner that replaced the
  // entire results area — jarring specifically on /search, since this
  // is the one page in the app where AdCard-shaped skeletons already
  // existed (home's FeaturedAds/RecentAds) but weren't reused here.
  // Picks AdCardSkeleton or AdListItemSkeleton to match whichever view
  // the user currently has selected, so a filter change or page
  // navigation doesn't visually snap between two different layouts.

  if (isLoading && !data) {
    return (
      <OfflineQueryFallback
        title="لا توجد نسخة محفوظة من الإعلانات"
        description="لا تتوفر بيانات الإعلانات المخزنة على هذا الجهاز. اتصل بالإنترنت لتحميلها ثم حاول مرة أخرى."
        fallback={
      <div className="space-y-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        {view === 'grid' ? (
          <div className={cn(LIST_CARD_GRID_CLASS)}>
            {Array.from({ length: 9 }).map((_, i) => <AdCardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <AdListItemSkeleton key={i} />)}
          </div>
        )}
      </div>
        }
      />
    );
  }
  if (isError && !isOnline) {
    return (
      <OfflineQueryFallback
        fallback={null}
        title="لا توجد نسخة محفوظة من الإعلانات"
        description="لا تتوفر بيانات الإعلانات المخزنة على هذا الجهاز. اتصل بالإنترنت لتحميلها ثم حاول مرة أخرى."
      />
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
    <>
<ListDataStatus isFetching={isFetching} hasData={Boolean(data)} isPlaceholderData={false} />

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
              className={cn('inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background', view === 'grid' ? 'bg-muted' : 'hover:bg-muted/50')}>
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </button>
            <button onClick={() => setView('list')}
              aria-label="عرض قائمة" aria-pressed={view === 'list'}
              className={cn('inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background', view === 'list' ? 'bg-muted' : 'hover:bg-muted/50')}>
              <LayoutList className="h-4 w-4" aria-hidden="true" />
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
                      router.push(`${pathname}?q=${encodeURIComponent(q)}`);
                    } else {
                      router.push(pathname);
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
        <div className={cn(LIST_CARD_GRID_CLASS, "stagger-fade-in")}>
          {items.map((ad) => <AdCard key={ad.id} ad={ad} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((ad) => <AdListItem key={ad.id} ad={ad} />)}
        </div>
      )}

      {items.length > 0 && (
        <InfiniteScrollTrigger
          hasNextPage={Boolean(hasNextPage)}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={loadMore}
        />
      )}
    </div>
    </>
  );
}
