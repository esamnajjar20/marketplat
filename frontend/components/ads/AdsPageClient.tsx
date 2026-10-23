'use client';

import dynamic from 'next/dynamic';
import { ListPageShell, LIST_CARD_GRID_CLASS } from '@/components/shared/list/ListPageShell';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';

const SearchFilters = dynamic(
  () => import('@/components/ads/SearchFilters').then((module) => module.SearchFilters),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const SearchFiltersSheet = dynamic(
  () => import('@/components/ads/SearchFiltersSheet').then((module) => module.SearchFiltersSheet),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const SearchSortBarWrapper = dynamic(
  () => import('@/components/ads/SearchSortBarWrapper').then((module) => module.SearchSortBarWrapper),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const AdCategoryChips = dynamic(
  () => import('@/components/ads/AdCategoryChips').then((module) => module.AdCategoryChips),
  { ssr: false, loading: () => <div className="h-8" aria-hidden="true" /> },
);
const SearchResults = dynamic(
  () => import('@/components/ads/SearchResults').then((module) => module.SearchResults),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 py-4" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">جارٍ تحميل الإعلانات…</p>
        <div className={LIST_CARD_GRID_CLASS}>
          {Array.from({ length: 6 }, (_, i) => (
            <AdCardSkeleton key={i} />
          ))}
        </div>
      </div>
    ),
  },
);

/**
 * صفحة الإعلانات العامة — نفس نمط صفحة المنتجات (تصميم المرجع):
 * عنوان بدون أيقونة، شريط بحث/ترتيب، شرائح تصنيفات، ثم الشبكة.
 */
export function AdsPageClient() {
  return (
    <ListPageShell
      title="الإعلانات"
      description="تصفح كل الإعلانات المنشورة في سوق غزة"
      className="bg-[#FBF9F4] dark:bg-background"
      toolbar={
        <div className="flex w-full flex-col gap-3">
          <div className="min-w-0 w-full">
            <SearchSortBarWrapper />
          </div>
          <AdCategoryChips />
          <div className="lg:hidden">
            <SearchFiltersSheet />
          </div>
        </div>
      }
      sidebar={<SearchFilters />}
    >
      <SearchResults />
    </ListPageShell>
  );
}
