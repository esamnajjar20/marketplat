import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Flame, ShoppingBag } from 'lucide-react';
import { ProductCard } from '@/components/stores/ProductCard';
import { PromotedLoadMore } from '@/components/promoted/PromotedLoadMore';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { productsApi } from '@/api/products.api';
import { ROUTES } from '@/lib/constants';
import { unwrapData } from '@/lib/apiPagination';
import type { ProductWithStore } from '@/types/product.types';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'الأكثر ترويجًا — سوق غزة',
  description:
    'منتجات وعروض مروَّجة من متاجر سوق غزة — لا تفوّت الخصومات والعروض النشطة.',
  path: '/promoted',
});

const PAGE_SIZE = 16;

export default async function PromotedPage() {
  const { items, meta } = unwrapData(await productsApi.getAll({
    hasPromotion: true,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    page: 1,
    limit: PAGE_SIZE,
  }));

  return (
    <div className="min-h-[50vh]">
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
              {meta.total > 0 && (
                <p className="text-xs text-muted-foreground">{meta.total.toLocaleString('ar')} منتج مُروَّج</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={ROUTES.products} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:border-primary/40">
                <ShoppingBag className="h-4 w-4" aria-hidden />
                كل المنتجات
              </Link>
              <Link href={ROUTES.home} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                الرئيسية
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-4 sm:py-8">
        {items.length === 0 ? (
          <EmptyState
            icon={<Flame className="h-8 w-8" />}
            title="لا عروض مروَّجة حالياً"
            description="عند تفعيل المتاجر لعروض جديدة ستظهر هنا."
            action={<Link href={ROUTES.products} className="text-sm font-medium text-primary">تصفّح كل المنتجات</Link>}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((product: ProductWithStore) => (
                <ProductCard key={product.id} product={product} storeId={product.store?.id} context="featured" />
              ))}
            </div>
            <PromotedLoadMore initialPage={1} hasNextPage={meta.hasNextPage} />
          </>
        )}
      </main>
    </div>
  );
}
