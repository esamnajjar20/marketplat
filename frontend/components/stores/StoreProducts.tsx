'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Package, Search, X } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ProductRecommendations } from '@/components/recommendations/ProductRecommendations';
import { DownloadStoreCatalogButton } from '@/components/stores/DownloadStoreCatalogButton';
import { useProducts } from '@/hooks/queries/useProducts';
import { ROUTES } from '@/lib/constants';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { ProductSortField } from '@/types/product.types';

interface Props {
  storeId: string;
  /** اسم المتجر لعنوان ملف التحميل — اختياري */
  storeName?: string;
  offersOnly?: boolean;
}

const SORT_OPTIONS: { value: string; label: string; sortBy: ProductSortField; sortOrder: 'asc' | 'desc' }[] = [
  { value: 'newest', label: 'الأحدث', sortBy: 'createdAt', sortOrder: 'desc' },
  { value: 'price_asc', label: 'السعر: الأقل', sortBy: 'price', sortOrder: 'asc' },
  { value: 'price_desc', label: 'السعر: الأعلى', sortBy: 'price', sortOrder: 'desc' },
  { value: 'views', label: 'الأكثر مشاهدة', sortBy: 'views', sortOrder: 'desc' },
];

export function StoreProducts({ storeId, storeName, offersOnly = false }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  // SW-FIX-PAGE-NAN: clamp URL page param to positive integer.
  const rawPage = Number(sp.get('productsPage') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const highlightId = sp.get('product');
  const sortKey = sp.get('sort') ?? 'newest';
  const sortOpt = SORT_OPTIONS.find((o) => o.value === sortKey) ?? SORT_OPTIONS[0]!;
  // PHASE1-STOREFRONT: in-store product search via URL `q`
  const searchFromUrl = (sp.get('q') ?? '').trim();
  const highlightRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSearchInput(searchFromUrl);
  }, [searchFromUrl]);

  // STOREFRONT-SEARCH-CLEANUP-01: cancel pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const { data, isLoading, isError, refetch } = useProducts({
    storeId,
    page,
    limit: 12,
    sortBy: sortOpt.sortBy,
    sortOrder: sortOpt.sortOrder,
    ...(searchFromUrl ? { search: searchFromUrl } : {}),
    ...(offersOnly ? { hasPromotion: true } : {}),
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const totalPages = data?.meta?.totalPages ?? 1;

  const highlightedProduct = useMemo(
    () => items.find((p) => p.id === highlightId) ?? null,
    [items, highlightId],
  );

  useEffect(() => {
    if (highlightedProduct) {
      track('PRODUCT_VIEW', {
        productId: highlightedProduct.id,
        categoryId: highlightedProduct.categoryId,
      });
    }
  }, [highlightedProduct]);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId, items]);

  function setSort(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value === 'newest') params.delete('sort');
    else params.set('sort', value);
    params.delete('productsPage');
    router.push(`${ROUTES.storeDetail(storeId)}?${params.toString()}`, { scroll: false });
  }

  const applySearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(sp.toString());
      const trimmed = value.trim();
      if (trimmed) params.set('q', trimmed);
      else params.delete('q');
      params.delete('productsPage');
      router.push(`${ROUTES.storeDetail(storeId)}?${params.toString()}`, { scroll: false });
    },
    [router, sp, storeId],
  );

  function onSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applySearch(value), 350);
  }

  function clearSearch() {
    setSearchInput('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applySearch('');
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-destructive">حدث خطأ أثناء تحميل المنتجات</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!offersOnly && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (debounceRef.current) clearTimeout(debounceRef.current);
                applySearch(searchInput);
              }
            }}
            placeholder="ابحث داخل منتجات هذا المتجر..."
            aria-label="بحث في منتجات المتجر"
            className="h-10 w-full rounded-full border border-border/80 bg-card pe-10 ps-10 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="مسح البحث"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="ترتيب المنتجات">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSort(opt.value)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
                sortKey === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {!offersOnly && storeName && (
          <DownloadStoreCatalogButton
            storeId={storeId}
            storeName={storeName}
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 rounded-full text-xs"
          />
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title={
            offersOnly
              ? 'لا عروض نشطة حاليًا'
              : searchFromUrl
                ? 'لا نتائج لهذا البحث'
                : 'لا توجد منتجات'
          }
          description={
            offersOnly
              ? 'لم يضف هذا المتجر عروضًا سارية الآن'
              : searchFromUrl
                ? `لم يُعثر على منتجات تطابق «${searchFromUrl}»`
                : 'لم يضف هذا المتجر أي منتج بعد'
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 stagger-fade-in">
          {items.map((product) => (
            <div
              key={product.id}
              ref={product.id === highlightId ? highlightRef : undefined}
              className={
                product.id === highlightId
                  ? 'rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background transition-all'
                  : undefined
              }
            >
              <ProductCard product={product} storeId={storeId} />
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.storeDetail(storeId)}
          searchParams={Object.fromEntries(
            Array.from(sp.entries()).filter(([k]) => k !== 'productsPage'),
          )}
          pageParam="productsPage"
        />
      )}

      {!offersOnly && <ProductRecommendations excludeProductId={highlightedProduct?.id} />}
    </div>
  );
}
