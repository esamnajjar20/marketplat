'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Flame, ArrowRight, ShoppingBag } from 'lucide-react';
import { ProductCard } from '@/components/stores/ProductCard';
import { ProductCardSkeleton } from '@/components/shared/skeletons';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useProducts } from '@/hooks/queries/useProducts';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 16;

/**
 * صفحة «الأكثر ترويجًا» — كل المنتجات ذات عرض/ترويج نشط.
 * GET /products?hasPromotion=true مع ترقيم صفحات.
 */
export function PromotedPageClient() {
  const sp = useSearchParams();
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const { data, isLoading, isError, refetch, isFetching } = useProducts({
    hasPromotion: true,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    page,
    limit: PAGE_SIZE,
  });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const total = data?.meta?.total ?? 0;
  const searchParams = Object.fromEntries(sp.entries());

  return (
    <div className="min-h-[50vh]">
      {/* Hero band */}
      <div className="border-b border-accent/15 bg-gradient-to-b from-accent/[0.12] to-transparent">
        <div className="container mx-auto max-w-7xl space-y-3 px-3 py-6 sm:px-4 sm:py-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                <Flame className="h-3.5 w-3.5" aria-hidden />
                عروض نشطة
              </p>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">الأكثر ترويجًا</h1>
              <p className="max-w-lg text-sm text-muted-foreground">
                منتجات بخصومات وعروض من متاجر سوق غزة — تُحدَّث باستمرار.
              </p>
              {!isLoading && total > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {total.toLocaleString('ar')} منتج مُروَّج
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={ROUTES.products}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:border-primary/40"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden />
                كل المنتجات
              </Link>
              <Link
                href={ROUTES.home}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                الرئيسية
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-4 sm:py-8">
        {isLoading && !data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-destructive">تعذّر تحميل العروض المروَّجة</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-sm font-medium text-primary hover:underline"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Flame className="h-8 w-8" />}
            title="لا عروض مروَّجة حالياً"
            description="عند تفعيل المتاجر لعروض جديدة ستظهر هنا."
            action={
              <Link
                href={ROUTES.products}
                className="text-sm font-medium text-primary hover:underline"
              >
                تصفّح كل المنتجات
              </Link>
            }
          />
        ) : (
          <>
            <div
              className={cn(
                'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4',
                isFetching && !isLoading && 'opacity-80',
              )}
            >
              {items.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  storeId={product.store?.id}
                  context="featured"
                />
              ))}
            </div>

            {totalPages > 1 ? (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                searchParams={searchParams}
                baseUrl={ROUTES.promoted}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
