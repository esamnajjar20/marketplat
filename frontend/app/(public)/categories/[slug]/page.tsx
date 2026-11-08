import type { Metadata }    from 'next';
import { DesktopOnly } from '@/components/shared/layout/DesktopOnly';
import dynamic from 'next/dynamic';
import { Suspense, cache } from 'react';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient }   from '@/lib/queryClient';
import { fetchPublicBrowsePage, prefetchCategories } from '@/lib/prefetch';
import { buildCategoryMetadata } from '@/lib/seo';
import { LoadingSpinner }   from '@/components/shared/feedback/LoadingSpinner';
import { categoriesApi }    from '@/api/categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { SSR_BROWSE_PAGE_SIZE, getBrowseNumber, getBrowseParam } from '@/lib/browseSearchParams';
import type { AdListItem } from '@/types/ad.types';
import type { Category } from '@/types/category.types';
import type { BrowsePage } from '@/types/browse.types';
import type { BrowseSearchParams } from '@/lib/browseSearchParams';

interface Props { params: Promise<{ slug: string }>; searchParams?: Promise<BrowseSearchParams> }

const CategoryHero = dynamic(
  () => import('@/components/home/CategoryHero').then((module) => module.CategoryHero),
);
const SearchFilters = dynamic(
  () => import('@/components/ads/SearchFilters').then((module) => module.SearchFilters),
  { loading: () => <div className="min-h-20" aria-hidden="true" /> },
);
const SearchFiltersSheet = dynamic(
  () =>
    import('@/components/ads/SearchFiltersSheet').then(
      (module) => module.SearchFiltersSheet,
    ),
  { loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const SearchSortBarWrapper = dynamic(
  () =>
    import('@/components/ads/SearchSortBarWrapper').then(
      (module) => module.SearchSortBarWrapper,
    ),
  { loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const SearchResults = dynamic(
  () => import('@/components/ads/SearchResults').then((module) => module.SearchResults),
  {
    loading: () => (
      <div className="flex justify-center py-12" role="status">
        <LoadingSpinner />
      </div>
    ),
  },
);

// Metadata and the route body share one category lookup within the request.
const getCachedCategory = cache((slug: string) => categoriesApi.getBySlug(slug));

// UX-FIX (audit P2-04): previously called buildCategoryMetadata({ slug,
// name: slug }) — the raw URL slug stood in for the display name, so
// <title>/meta description showed e.g. "electronics-devices — App"
// while the page's own <h1> (CategoryHero, via useCategoryBySlug)
// correctly showed the Arabic name. Same try/catch-with-fallback shape
// already used by ads/[id]/page.tsx and profile/[id]/page.tsx — a
// failed/unknown slug still renders a sane generic title instead of
// throwing out of generateMetadata.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await getCachedCategory(slug);
    const category = res.data.data;
    if (!category) return { title: 'القسم غير موجود' };
    return buildCategoryMetadata({ slug, name: category.nameAr });
  } catch {
    return { title: 'الفئات' };
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const routeSearchParams: BrowseSearchParams = searchParams ? await searchParams : {};
  const qc = getQueryClient();
  await prefetchCategories(qc);

  let category: Category | null = null;
  try {
    const response = await getCachedCategory(slug);
    category = response.data.data ?? null;
    if (category) qc.setQueryData(queryKeys.categories.slug(slug), category);
  } catch {
    // CategoryHero and SearchResults retain their client retry/offline paths.
  }

  const routeCategoryId = getBrowseParam(routeSearchParams, 'categoryId') ?? category?.id;
  const query = getBrowseParam(routeSearchParams, 'q')?.trim() ?? '';
  const searchEnabled = query.length >= 2;
  const browseParams = {
    page: 1,
    limit: SSR_BROWSE_PAGE_SIZE,
    q: searchEnabled ? query : undefined,
    categoryId: routeCategoryId,
    city: getBrowseParam(routeSearchParams, 'city'),
    condition: getBrowseParam(routeSearchParams, 'condition'),
    minPrice: getBrowseNumber(routeSearchParams, 'minPrice'),
    maxPrice: getBrowseNumber(routeSearchParams, 'maxPrice'),
    sortBy: getBrowseParam(routeSearchParams, 'sortBy') ?? 'createdAt',
    sortOrder: getBrowseParam(routeSearchParams, 'sortOrder') ?? 'desc',
  };

  let initialPage: BrowsePage<AdListItem> | null = null;
  let initialPageUpdatedAt: number | undefined;
  if (category && routeCategoryId) {
    try {
      initialPage = await fetchPublicBrowsePage<AdListItem>(
        searchEnabled ? '/ads/search' : '/ads',
        browseParams,
        { timeoutMs: 2_500 },
      );
      initialPageUpdatedAt = Date.now();
    } catch {
      // Do not fail the category shell if the optional first-page fetch times out.
    }
  }

  return (
    <div className="container mx-auto w-full max-w-7xl space-y-6 px-3 py-6 sm:px-4 lg:py-8">
      <HydrationBoundary state={dehydrate(qc)}>
        <CategoryHero slug={slug} />
        {/* P0 FIX (layout audit §1): SearchFiltersSheet mirrors /search's
            FIX P1-2 — full filter panel behind a "تصفية" trigger below
            `lg`, so mobile users see results before they see filters. */}
        {/* FIX P2-08 (audit item #8): sort sits next to the filters
            trigger, independent of it, on every breakpoint. */}
        <div className="flex items-center gap-2">
          <Suspense>
            <SearchFiltersSheet categorySlug={slug} />
          </Suspense>
          <div className="flex-1 sm:flex-none sm:w-48 lg:ms-auto">
            <Suspense>
              <SearchSortBarWrapper />
            </Suspense>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="hidden lg:col-span-1 lg:block">
            <div className="sticky top-24">
              <DesktopOnly><Suspense><SearchFilters categorySlug={slug} /></Suspense></DesktopOnly>
            </div>
          </aside>
          <div className="lg:col-span-3">
            <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
              <SearchResults
                categorySlug={slug}
                searchParams={routeSearchParams}
                initialPage={initialPage}
                initialPageUpdatedAt={initialPageUpdatedAt}
              />
            </Suspense>
          </div>
        </div>
      </HydrationBoundary>
    </div>
  );
}
