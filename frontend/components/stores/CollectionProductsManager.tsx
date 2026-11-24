'use client';

import { useMemo } from 'react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { ArrowRight, Check, Package, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { AdListItemSkeleton } from '@/components/shared/skeletons/AdListItemSkeleton';
import { useCollection, useManageCollectionProducts } from '@/hooks/queries/useCollections';
import { useInfiniteMyProducts } from '@/hooks/queries/useProducts';
import {
  useAddProductToCollection,
  useRemoveProductFromCollection,
} from '@/hooks/mutations/useCollectionMutations';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { formatPrice } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';

interface Props {
  collectionId: string;
}

/** Owner-facing membership manager: hidden collections and paused members are kept manageable. */
export function CollectionProductsManager({ collectionId }: Props) {
  const { data: collection, isLoading: collectionLoading, isError: collectionError, refetch: refetchCollection } = useCollection(collectionId);
  const { data: memberProducts, isLoading: membersLoading, isError: membersError, refetch } =
    useManageCollectionProducts(collectionId);
  const productsQuery = useInfiniteMyProducts(
    { status: 'ACTIVE', limit: 50, ...(collection?.storeId ? { storeId: collection.storeId } : {}) },
    { enabled: Boolean(collection?.storeId) },
  );
  const productsLoading = productsQuery.isLoading;
  const productsError = productsQuery.isError;

  const addProduct = useAddProductToCollection(collectionId);
  const removeProduct = useRemoveProductFromCollection(collectionId);

  const isLoading = collectionLoading || membersLoading || productsLoading;
  const products = useMemo(() => {
    const activeProducts = productsQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const all = new Map<string, (typeof activeProducts)[number]>();
    for (const product of activeProducts) all.set(product.id, product);
    for (const product of memberProducts ?? []) all.set(product.id, product as (typeof activeProducts)[number]);
    return Array.from(all.values());
  }, [productsQuery.data, memberProducts]);
  const memberIds = new Set((memberProducts ?? []).map((p) => p.id));
  const hasLoadMore = Boolean(productsQuery.hasNextPage);

  function toggle(productId: string) {
    if (memberIds.has(productId)) {
      removeProduct.mutate(productId);
    } else {
      addProduct.mutate(productId);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <IntentPrefetchLink href={ROUTES.myStoreCollections} prefetch={false}>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowRight className="h-4 w-4" />المجموعات
          </Button>
        </IntentPrefetchLink>
        <h1 className="text-xl font-extrabold">
          منتجات: {collection?.name ?? '…'}
        </h1>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <AdListItemSkeleton key={i} />)}
        </div>
      ) : collectionError || membersError || productsError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-muted-foreground" />
          <p className="text-destructive">حدث خطأ أثناء تحميل المنتجات</p>
          <div className="flex items-center gap-3">
            {collectionError ? <button type="button" onClick={() => void refetchCollection()} className="text-sm text-primary hover:underline">إعادة تحميل بيانات المجموعة</button> : null}
            {membersError ? <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">إعادة تحميل عضويات المجموعة</button> : null}
            {productsError ? <button type="button" onClick={() => void productsQuery.refetch()} className="text-sm text-primary hover:underline">إعادة تحميل المنتجات</button> : null}
          </div>
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title="لا توجد منتجات نشطة"
          description="أضف منتجات نشطة إلى متجرك أولاً لتتمكن من إضافتها إلى هذه المجموعة"
          action={
            <IntentPrefetchLink href={ROUTES.myStoreProductCreate} prefetch={false}>
              <Button>إضافة منتج</Button>
            </IntentPrefetchLink>
          }
        />
      ) : (
        <div className="space-y-2">
          {products.map((product) => {
            const isMember = memberIds.has(product.id);
            const thumb = product.images[0]
              ? getThumbnailUrl(product.images[0], 80, 80)
              : PLACEHOLDER_SVG;
            const isPending =
              (addProduct.isPending && addProduct.variables === product.id) ||
              (removeProduct.isPending && removeProduct.variables === product.id);

            return (
              <button
                key={product.id}
                type="button"
                onClick={() => toggle(product.id)}
                disabled={isPending}
                className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card shadow-sm p-2.5 text-start transition-colors hover:bg-muted/50 disabled:opacity-60"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  <SafeImage src={thumb} alt="" fill className="object-cover" sizes="48px" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="line-clamp-1 text-sm font-medium">{product.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{formatPrice(product.price)}</p>
                </div>
                <div
                  className={
                    isMember
                      ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground'
                      : 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-input'
                  }
                >
                  {isMember && <Check className="h-4 w-4" />}
                </div>
              </button>
            );
          })}
          {hasLoadMore ? (
            <div className="flex justify-center pt-2">
              <Button type="button" variant="outline" disabled={productsQuery.isFetchingNextPage} onClick={() => void productsQuery.fetchNextPage()} className="gap-2">
                {productsQuery.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                تحميل المزيد من المنتجات
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
