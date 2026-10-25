'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { SearchX, AlertTriangle, ChevronLeft } from 'lucide-react';
import { ProductDetail } from '@/components/stores/ProductDetail';
import { AdDetailsSkeleton } from '@/components/shared/skeletons/AdDetailsSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { OfflineQueryFallback } from '@/components/shared/feedback/OfflineQueryFallback';
import { OfflineStaleDataNotice } from '@/components/shared/feedback/OfflineStaleDataNotice';
import { Button } from '@/components/shared/ui/Button';
import { useProduct } from '@/hooks/queries/useProducts';
import { useProducts } from '@/hooks/queries/useProducts';
import { track } from '@/lib/analytics';
import { ROUTES } from '@/lib/constants';
import { parseApiError } from '@/lib/errorParser';

export function ProductDetailSection({ id }: { id: string }) {
  const { data: product, isLoading, isFetching, isError, error, refetch } = useProduct(id);
  const storeId = product?.storeId;
  const { data: relatedPage } = useProducts(
    { storeId: storeId ?? '', limit: 6 },
    { enabled: Boolean(storeId) },
  );

  useEffect(() => {
    if (product?.id) {
      track('PRODUCT_VIEW', { productId: product.id, storeId: product.storeId });
    }
  }, [product?.id, product?.storeId]);

  if (isLoading && !product) {
    return (
      <OfflineQueryFallback
        title="المنتج غير متاح دون اتصال"
        loading={isLoading}
        fallback={<AdDetailsSkeleton />}
      />
    );
  }

  // A failed background refetch should not replace a previously loaded product.
  if (isError && !product) {
    const parsed = parseApiError(error);
    const notFound = parsed.statusCode === 404;
    return (
      <OfflineQueryFallback
        title="المنتج غير متاح دون اتصال"
        fallback={
          <EmptyState
            icon={notFound ? <SearchX className="h-10 w-10" /> : <AlertTriangle className="h-10 w-10" />}
            title={notFound ? 'المنتج غير موجود' : 'تعذّر تحميل المنتج'}
            description={
              notFound
                ? 'ربما حُذف أو لم يعد متاحاً للعرض.'
                : 'تحقق من الاتصال ثم أعد المحاولة.'
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {!notFound && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isFetching}
                    aria-busy={isFetching}
                    onClick={() => { if (!isFetching) void refetch(); }}
                  >
                    {isFetching ? 'جارٍ إعادة المحاولة…' : 'إعادة المحاولة'}
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link href={ROUTES.search + '?type=products'}>تصفّح المنتجات</Link>
                </Button>
              </div>
            }
          />
        }
      />
    );
  }

  if (!product) {
    return (
      <OfflineQueryFallback
        title="المنتج غير متاح دون اتصال"
        fallback={<EmptyState icon={<AlertTriangle className="h-10 w-10" />} title="تعذّر تحميل المنتج" description="تحقق من الاتصال ثم أعد المحاولة." />}
      />
    );
  }

  const related = (relatedPage?.items ?? []).filter((p) => p.id !== product.id).slice(0, 6);

  return (
    <div className="space-y-4">
      {isError && <OfflineStaleDataNotice onRetry={() => { if (!isFetching) void refetch(); }} isFetching={isFetching} />}
      <nav aria-label="مسار التصفح" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link href={ROUTES.home} className="hover:text-primary">الرئيسية</Link>
        <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <Link href={ROUTES.products} className="hover:text-primary">المنتجات</Link>
        <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <Link href={ROUTES.storeDetail(product.store.slug || product.storeId)} className="hover:text-primary">
          {product.store.name}
        </Link>
        <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="line-clamp-1 text-foreground/80">{product.name}</span>
      </nav>
      <ProductDetail product={product} related={related} />
    </div>
  );
}
