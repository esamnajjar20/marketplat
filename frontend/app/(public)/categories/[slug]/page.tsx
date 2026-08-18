import type { Metadata }    from 'next';
import { Suspense }         from 'react';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { CategoryHero }     from '@/components/home/CategoryHero';
import { SearchFilters }    from '@/components/ads/SearchFilters';
import { SearchFiltersSheet } from '@/components/ads/SearchFiltersSheet';
import { SearchSortBarWrapper } from '@/components/ads/SearchSortBarWrapper';
import { SearchResults }    from '@/components/ads/SearchResults';
import { getQueryClient }   from '@/lib/queryClient';
import { prefetchCategories } from '@/lib/prefetch';
import { buildCategoryMetadata } from '@/lib/seo';
import { LoadingSpinner }   from '@/components/shared/feedback/LoadingSpinner';
import { categoriesApi }    from '@/api/categories.api';
import { API_BASE_URL }     from '@/lib/constants';
import type { Category }    from '@/types/category.types';

interface Props { params: Promise<{ slug: string }> }

// RENDER-FIX (dynamic-routes audit, item C): categories are an
// admin-curated site taxonomy, not user-generated content — the
// backend's own getCategories() has no pagination/limit at all
// (categories.service.ts: plain findMany(), 1h Redis TTL, comment
// "categories rarely change") and categories.routes.ts applies a
// CACHE.LONG (1h) middleware to both GET / and GET /slug/:slug. That
// combination is what makes full static generation safe here — it's
// the opposite situation from /ads/[id] et al., where the backing
// tables are paginated and effectively unbounded.
//
// Fetched directly with `next: { revalidate }` (not via prefetchCategories,
// which is designed to run inside a request and warm the per-request
// TanStack Query cache) — generateStaticParams runs at build time,
// outside any request, and only needs the flat slug list.
async function getAllCategorySlugs(): Promise<string[]> {
  const flatten = (cats: Category[]): string[] =>
    cats.flatMap((c) => [c.slug, ...(c.children?.length ? flatten(c.children) : [])]);

  try {
    const res = await fetch(`${API_BASE_URL}/categories`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Category[] };
    return flatten(json.data ?? []);
  } catch {
    // Build-time fetch failure (e.g. API unreachable during CI/offline
    // build) must not fail the whole production build — falling back to
    // an empty list means zero categories are prerendered this build,
    // and every category page is instead generated on first visit and
    // cached per Next's on-demand ISR (dynamicParams defaults to true),
    // exactly the same safety net /ads/[id] etc. rely on.
    return [];
  }
}

export async function generateStaticParams() {
  const slugs = await getAllCategorySlugs();
  return slugs.map((slug) => ({ slug }));
}

export const revalidate = 3600;

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
    const res = await categoriesApi.getBySlug(slug);
    const category = res.data.data;
    if (!category) return { title: 'القسم غير موجود' };
    return buildCategoryMetadata({ slug, name: category.nameAr });
  } catch {
    return { title: 'الفئات' };
  }
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const qc = getQueryClient();
  await prefetchCategories(qc);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
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
            <Suspense><SearchFilters categorySlug={slug} /></Suspense>
          </aside>
          <main className="lg:col-span-3">
            <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
              <SearchResults categorySlug={slug} />
            </Suspense>
          </main>
        </div>
      </HydrationBoundary>
    </div>
  );
}
