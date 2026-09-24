'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { UnifiedResultCard } from '@/components/search/UnifiedResultCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptySearchSuggestions } from '@/components/search/EmptySearchSuggestions';
import { EmptySearchAlternatives } from '@/components/search/EmptySearchAlternatives';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { SaveSearchButton } from '@/components/ads/SaveSearchButton';
import { useSearch } from '@/hooks/queries/useSearch';
import { useProgressiveSearchRadius } from '@/hooks/queries/useProgressiveSearchRadius';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { formatRadiusLabel } from '@/lib/progressiveRadius';
import { ROUTES } from '@/lib/constants';
import { track } from '@/lib/analytics';
import type { SearchSort, SearchType } from '@/types/search.types';
import { SearchViewToggle, type SearchViewMode } from '@/components/search/SearchViewToggle';
import { SearchResultsMap } from '@/components/map/SearchResultsMap';

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
  const isOnline = useOnlineStatus();

  const q          = sp.get('q') ?? undefined;
  const city       = sp.get('city') ?? undefined;
  const type       = (sp.get('type') as SearchType) ?? 'all';
  const categoryId = sp.get('categoryId') ?? undefined;
  const sort       = (sp.get('sort') as SearchSort) ?? 'relevance';
  // SW-FIX-PAGE-NAN: clamp URL page param to positive integer.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  // TRACK-NEARBY-SEARCH: lat/lng/radius live in the URL like every
  // other filter on this page (SearchNearbyToggle writes them via
  // router.push, the same "URL is the source of truth" convention
  // SearchFilters/SearchTabsWrapper already use) — unlike
  // NearbyServiceProviders.tsx's local useState, this page's filters/
  // sort/pagination are already URL-driven, so geo belongs there too
  // rather than introducing a second, inconsistent state mechanism.
  const latParam    = sp.get('lat');
  const lngParam    = sp.get('lng');
  // SW-FIX-SEARCH-LATLNG-NAN: a hand-edited ?lat=abc&lng=def used to flow
  // Number('abc')=NaN through useSearch (sent as NaN on the wire),
  // effectiveSort='distance' (invalid with no real coords), and the map's
  // userLocation marker. Clamp both to finite numbers here — invalid
  // values are treated as "no location", matching how SearchNearbyToggle
  // already validates via isUsableNearbyCoord before writing them.
  const latNum      = latParam !== null ? Number(latParam) : NaN;
  const lngNum      = lngParam !== null ? Number(lngParam) : NaN;
  const lat         = Number.isFinite(latNum) ? latNum : undefined;
  const lng         = Number.isFinite(lngNum) ? lngNum : undefined;
  const radiusParam = sp.get('radius');
  const radius      = radiusParam !== null ? Number(radiusParam) : undefined;

  // توسيع تدريجي عندما يتوفر GPS ولم يُحدَّد radius يدويًا وليس هناك مدينة
  const progressive = useProgressiveSearchRadius({
    enabled: lat !== undefined && lng !== undefined,
    lat,
    lng,
    explicitRadius: radius,
    type,
    q,
    city,
    categoryId,
    sort: lat !== undefined ? 'distance' : sort,
    limit: 12,
  });

  const effectiveRadius =
    radius !== undefined && !Number.isNaN(radius)
      ? radius
      : progressive.radiusKm ?? undefined;

  const effectiveSort: SearchSort =
    lat !== undefined && lng !== undefined && (sort === 'relevance' || sort === 'distance')
      ? 'distance'
      : sort;

  // UX-FIX (audit P2-02): mirrors exactly what SearchFilters.tsx's own
  // reset button clears (city/categoryId/sort/geo — q is deliberately
  // preserved by that button, so it's not "active" in this sense).
  // SW-FIX-SEARCH-ACTIVE-FILTERS: also checked lng — a URL hand-edited
  // to have only lng (no lat) still wrote a location sort that the
  // previous expression missed.
  const hasActiveFilters = Boolean(city || categoryId || (sort && sort !== 'relevance') || lat !== undefined || lng !== undefined);

  const { data, isLoading: searchLoading, isError, refetch } = useSearch({
    q,
    city,
    type,
    categoryId,
    sort: effectiveSort,
    page,
    lat,
    lng,
    radius: effectiveRadius,
  });

  const isLoading = searchLoading || (Boolean(lat !== undefined && lng !== undefined) && !progressive.resolved);

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const [viewMode, setViewMode] = useState<SearchViewMode>('list');
  const userLocation =
    lat !== undefined && lng !== undefined
      ? { lat: Number(lat), lng: Number(lng) }
      : null;
  const mapPoints = useMemo(
    () =>
      items
        .filter((r) => r.latitude != null && r.longitude != null)
        .map((r) => ({
          id: `${r.type}-${r.id}`,
          title: r.title,
          lat: Number(r.latitude),
          lng: Number(r.longitude),
          href: r.url,
          subtitle: r.city ?? undefined,
        })),
    [items]
  );
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
        {/* UX-FIX: this grid sits in a 3-of-4-column <main> next to the
            filters <aside> (see (public)/search/page.tsx), so it had
            real width to work with but was capped at xl:grid-cols-3 —
            stuck at just 2 columns for the whole lg range (1024–1279px,
            a very common desktop width) despite the space, while every
            other ad grid in the app (RecentAds/FeaturedAds/etc.) reaches
            4 columns. Same fix mirrored below and in ads/SearchResults.tsx
            (categories/[slug] uses the identical 1-col-sidebar layout). */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {Array.from({ length: 9 }).map((_, i) => <AdCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (isError) {
    // FIX SEARCH-OFFLINE-01: useSearch already falls back to a local
    // substring index (lib/offlineSearchIndex.ts's searchOffline) built
    // from CORE_CACHE when the network request fails — q/city/type
    // filters DO match offline as long as a core bundle was ever warmed
    // (see offlineCoreBundle.ts). isError here therefore does NOT mean
    // "this specific search has filters" — searchOffline returns a
    // normal (possibly empty) result whenever hasBundle is true,
    // regardless of filters, and that path never reaches this branch at
    // all. isError only fires when either (a) it's a genuine online
    // server error, or (b) hasBundle is false — no core bundle has ever
    // been cached (e.g. app opened for the first time while offline, or
    // storage was cleared) — in which case there's nothing local to
    // fall back to no matter what the user searches for. The generic
    // "حدث خطأ أثناء تحميل النتائج" + a "إعادة المحاولة" button that
    // cannot succeed offline didn't distinguish this case at all.
    if (!isOnline) {
      return (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-destructive">البحث يحتاج اتصال بالإنترنت</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            لا توجد بيانات محفوظة على الجهاز للبحث بدون نت بعد. افتح التطبيق
            وأنت متصل مرة واحدة على الأقل ليتوفر بحث أساسي لاحقًا بدون اتصال.
          </p>
          <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
            إعادة المحاولة
          </button>
        </div>
      );
    }

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
      {lat !== undefined && lng !== undefined && effectiveRadius != null && (
        <div className="flex flex-wrap items-center gap-2">
          <LocationSourceBadge source="gps" radiusKm={effectiveRadius} />
          <span className="text-xs text-muted-foreground">
            أقرب النتائج أولًا — {formatRadiusLabel(Number(effectiveRadius))}
          </span>
        </div>
      )}

      {/* Toolbar — same "count on the left, save-search on the right"
          pattern as ads/SearchResults.tsx (categories/[slug] page), so
          the action is available on the main /search page too and not
          just when arriving via a category. SaveSearchButton reads the
          URL's own filter params independently, so it doesn't need any
          props threaded through from here. */}
      {/* Toolbar — save-search only makes sense once the visitor has
          narrowed to one matchable entity kind, OR picks one inside
          the button itself. type='all' mixes ads/products/stores/
          services in one grid with no single filter shape to store
          server-side, so SaveSearchButton now asks which kind to save
          as when `type` is omitted (see its own TYPE-PICK-STEP doc)
          rather than hiding entirely on "الكل". 'stores' still has no
          entry point at all — stores.service.ts's createStore doesn't
          call savedSearchEvents, unlike ads/products/services, so
          there is no matcher a stores-typed SavedSearch could ever
          fire against. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">
          <span>{total > 0 ? `${total} نتيجة` : 'لا توجد نتائج'}</span>
          {q && (
            <>
              {' '}
              بحثاً عن «<span className="font-medium text-foreground">{q}</span>»
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <SearchViewToggle value={viewMode} onChange={setViewMode} />
          {type !== 'stores' && (
            <SaveSearchButton type={type === 'all' ? undefined : type} queryParamKey="q" />
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <>
        {/* Empty state + category escape hatches */}
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title={q ? `لم نجد نتائج لـ «${q}»` : 'لا توجد نتائج'}
          description={
            q
              ? 'جرّب كلمة أقصر، أو امسح الفلاتر، أو اختر تصنيفاً من الاقتراحات بالأسفل.'
              : 'لا توجد نتائج مطابقة لهذه الفلاتر. وسّع النطاق أو اختر نوعاً آخر.'
          }
          action={
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              {(hasActiveFilters || q) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(
                      hasActiveFilters && q
                        ? `${ROUTES.search}?q=${encodeURIComponent(q)}`
                        : ROUTES.search,
                    )
                  }
                >
                  {hasActiveFilters ? 'مسح الفلاتر' : 'عرض كل النتائج'}
                </Button>
              )}
              <Button variant="default" size="sm" asChild>
                <Link href={ROUTES.adCreate} prefetch={false}>انشر إعلاناً بدلاً من ذلك</Link>
              </Button>
            </div>
          }
        />
        <EmptySearchSuggestions />
        <EmptySearchAlternatives />
        </>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 stagger-fade-in">
          {viewMode === 'map' ? (
            <div className="col-span-full">
              <SearchResultsMap points={mapPoints} userLocation={userLocation} />
            </div>
          ) : (
            items.map((result) => (
              <UnifiedResultCard key={`${result.type}-${result.id}`} result={result} />
            ))
          )}
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
