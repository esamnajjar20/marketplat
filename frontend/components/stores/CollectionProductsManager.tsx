'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { ArrowRight, Check, Package, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { AdListItemSkeleton } from '@/components/shared/skeletons/AdListItemSkeleton';
import { useCollection, useCollectionProducts } from '@/hooks/queries/useCollections';
import { useMyProducts } from '@/hooks/queries/useProducts';
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

/**
 * COLLECTIONS (P1): owner-facing membership manager for one
 * collection — every ACTIVE product in the store, toggle-able in/out
 * of this collection. Reads `useCollectionProducts` (the public
 * endpoint's ACTIVE-only membership list, see collections.repository.ts's
 * findVisibleProducts) rather than a dedicated "all members incl.
 * paused" owner endpoint, since the backend doesn't expose one — a
 * PAUSED product an owner previously added simply won't show as
 * checked here until it's reactivated, which matches what a buyer
 * would see on the storefront tab anyway.
 */
export function CollectionProductsManager({ collectionId }: Props) {
  const { data: collection, isLoading: collectionLoading } = useCollection(collectionId);
  const { data: memberProducts, isLoading: membersLoading, isError, refetch } =
    useCollectionProducts(collectionId);
  const { data: allProductsPage, isLoading: productsLoading } = useMyProducts({
    status: 'ACTIVE',
    limit: 100,
  });

  const addProduct = useAddProductToCollection(collectionId);
  const removeProduct = useRemoveProductFromCollection(collectionId);

  const isLoading = collectionLoading || membersLoading || productsLoading;
  const products = allProductsPage?.items ?? [];
  const memberIds = new Set((memberProducts ?? []).map((p) => p.id));

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
        <Link href={ROUTES.myStoreCollections}>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowRight className="h-4 w-4" />المجموعات
          </Button>
        </Link>
        <h1 className="text-xl font-bold">
          منتجات: {collection?.name ?? '…'}
        </h1>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <AdListItemSkeleton key={i} />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-muted-foreground" />
          <p className="text-destructive">حدث خطأ أثناء تحميل المنتجات</p>
          <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
            إعادة المحاولة
          </button>
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title="لا توجد منتجات نشطة"
          description="أضف منتجات نشطة إلى متجرك أولاً لتتمكن من إضافتها إلى هذه المجموعة"
          action={
            <Link href={ROUTES.myStoreProductCreate}>
              <Button>إضافة منتج</Button>
            </Link>
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
                className="flex w-full items-center gap-3 rounded-lg border bg-card p-2.5 text-start transition-colors hover:bg-muted/50 disabled:opacity-60"
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
        </div>
      )}
    </div>
  );
}
