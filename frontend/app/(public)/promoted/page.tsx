import type { Metadata } from 'next';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { ArrowRight, Flame, ShoppingBag } from 'lucide-react';
import { PromotedLoadMore } from '@/components/promoted/PromotedLoadMore';
import { ProductCard } from '@/components/stores/ProductCard';
import { fetchServerApi } from '@/lib/server/serverApiFetch';
import { getQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { ROUTES, APP_NAME } from '@/lib/constants';
import type { ProductWithStore } from '@/types/product.types';
import type { PaginationMeta } from '@/types/api.types';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'الأكثر ترويجًا',
  description:
    `منتجات وعروض مروَّجة من متاجر ${APP_NAME} — لا تفوّت الخصومات والعروض النشطة.`,
  path: '/promoted',
});

const PAGE_SIZE = 16;

export default async function PromotedPage() {
  const queryClient = getQueryClient();
  let items: ProductWithStore[] = [];
  let meta: PaginationMeta | null = null;
  try {
    const response = await fetchServerApi<ProductWithStore[]>(
      `/products?hasPromotion=true&sortBy=createdAt&sortOrder=desc&page=1&limit=${PAGE_SIZE}`,
      { mode: 'no-store', timeoutMs: 3_000 },
    );
    items = response.data ?? [];
    meta = response.meta?.pagination as PaginationMeta | undefined ?? null;
    if (meta) {
      queryClient.setQueryData(queryKeys.products.promotedInfinite(PAGE_SIZE), {
        pages: [{ items, meta }],
        pageParams: [1],
      });
    }
  } catch {
    // The infinite query below performs the client retry if the server read fails.
  }

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
              {typeof meta?.total === 'number' && meta.total > 0 && (
                <p className="text-xs text-muted-foreground">{meta.total.toLocaleString('ar')} منتج مُروَّج</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <IntentPrefetchLink href={ROUTES.products} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:border-primary/40" prefetch={false}>
                <ShoppingBag className="h-4 w-4" aria-hidden />
                كل المنتجات
              </IntentPrefetchLink>
              <IntentPrefetchLink href={ROUTES.home} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" prefetch={false}>
                الرئيسية
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </IntentPrefetchLink>
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-4 sm:py-8">
        {meta && items.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} storeId={product.store?.id} context="featured" />
            ))}
          </div>
        ) : null}
        <HydrationBoundary state={dehydrate(queryClient)}>
          <PromotedLoadMore hasServerSeed={Boolean(meta)} />
        </HydrationBoundary>
      </main>
    </div>
  );
}
