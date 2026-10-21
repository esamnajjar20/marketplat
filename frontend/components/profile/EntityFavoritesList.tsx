'use client';

import { ProductCard } from '@/components/stores/ProductCard';
import { StoreCard } from '@/components/stores/StoreCard';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { ProductCardSkeleton, StoreCardSkeleton, ServiceListingCardSkeleton } from '@/components/shared/skeletons';
import { Pagination } from '@/components/shared/ui/Pagination';
import { Button } from '@/components/shared/ui/Button';
import { useFavoritesByType } from '@/hooks/queries/useFavorites';
import { useToggleFavoriteEntity } from '@/hooks/mutations/useFavoriteMutations';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { cn } from '@/lib/utils';
import { useLongPress } from '@/hooks/ui/useLongPress';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Heart, Check } from 'lucide-react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';
import type { FavoriteEntityKind } from '@/types/favorite.types';
import type { ProductWithStore } from '@/types/product.types';
import type { StoreWithSeller } from '@/types/store.types';
import type { ServiceListingWithProvider } from '@/types/service.types';

import { Spinner } from '@/components/ui/spinner';
interface Props {
  type: FavoriteEntityKind;
}

/** Union of every entity shape PR3 favorites; the hook's generic is
 * instantiated with this explicitly below — TS cannot infer T from
 * `type: FavoriteEntityKind` alone (it's a runtime value, not a type
 * discriminant), so left unannotated T silently defaults to `unknown`.
 */
type FavoriteEntity = ProductWithStore | StoreWithSeller | ServiceListingWithProvider;

const EMPTY_COPY: Record<FavoriteEntityKind, { title: string; description: string; cta: string; href: string }> = {
  PRODUCT: {
    title: 'لا توجد منتجات محفوظة',
    description: 'احفظ المنتجات التي تعجبك لتجدها هنا لاحقاً',
    cta: 'تصفح المنتجات',
    href: ROUTES.home,
  },
  STORE: {
    title: 'لا توجد متاجر محفوظة',
    description: 'احفظ المتاجر التي تعجبك لتجدها هنا لاحقاً',
    cta: 'تصفح المتاجر',
    href: ROUTES.stores,
  },
  SERVICE_LISTING: {
    title: 'لا توجد خدمات محفوظة',
    description: 'احفظ الخدمات التي تعجبك لتجدها هنا لاحقاً',
    cta: 'تصفح الخدمات',
    href: ROUTES.services,
  },
};

/**
 * FEAT-FAVORITE-POLYMORPHIC PR3: generic counterpart of
 * FavoritesList.tsx (which stays AD-only, untouched) for
 * PRODUCT/STORE/SERVICE_LISTING. GET /favorites?type=... returns one
 * type per call (favorites.validation.ts's getFavoritesSchema — no
 * mixed-type response), so this renders exactly one type per mount;
 * FavoritesTabs.tsx picks which type based on the URL.
 */
export function EntityFavoritesList({ type }: Props) {
  const sp = useSearchParams();
  // clamp URL page param to positive integer.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const listId = sp.get('list') || undefined;
  const { data, isLoading, isError, refetch } = useFavoritesByType<FavoriteEntity>(type, {
    page,
    listId,
  });
  const toggleFavorite = useToggleFavoriteEntity(type);

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const totalItems = data?.meta?.total ?? items.length;
  const copy = EMPTY_COPY[type];

  // BULK-ENTITY-FAVORITES-REMOVE-01: same pattern as FavoritesList.tsx.
  // The hook is instantiated with the current `type`, so one bulk
  // action works for products, stores, and services without branching.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setSelectionMode(false);
  }, [page, listId, type]);


  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }

  function enterSelectionWith(id: string) {
    setSelectionMode(true);
    setSelected((prev) => new Set(prev).add(id));
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectionMode(false);
  }

  const longPressTargetIdRef = useRef<string | null>(null);
  const longPressHandlers = useLongPress(() => {
    const id = longPressTargetIdRef.current;
    if (id) enterSelectionWith(id);
  }, { enabled: !selectionMode });

  function selectAllVisible() {
    setSelected(new Set(items.map((f) => f.entityId)));
    setSelectionMode(true);
  }

  async function performBulkRemove() {
    setConfirmBulkRemove(false);
    setBulkBusy('remove');
    const ids = Array.from(selected);
    const CONCURRENCY = 4;
    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const batch = ids.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((id) => toggleFavorite.mutateAsync(id)),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') ok += 1; else fail += 1;
        }
      }
      const { toast } = await import('sonner');
      const msg = fail > 0 ? `أُزيل ${ok} (فشل ${fail})` : `أُزيل ${ok}`;
      toast.success(msg);
    } finally {
      setBulkBusy(null);
      clearSelection();
    }
  }

  if (isLoading) {
    return (
      <div className={type === 'STORE'
        ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4'
        : 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'}>
        {Array.from({ length: 6 }).map((_, i) => <EntityCardSkeleton key={i} type={type} />)}
      </div>
    );
  }

  // Same ordering as FavoritesList.tsx: a real fetch
  // failure must never be misread as "genuinely no favorites".
  if (isError) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-xs">
        <p className="font-bold text-destructive">حدث خطأ أثناء تحميل المفضلة</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 rounded-xl font-bold"
          onClick={() => refetch()}
        >
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-7 text-center shadow-xs">
        <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Heart className="h-7 w-7" />
        </div>
        <h2 className="text-base font-bold">{copy.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
        <div className="mt-5 flex justify-center">
          <Button asChild size="sm" className="rounded-xl font-bold">
            <Link href={copy.href}>{copy.cta}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', selectionMode && 'pb-28 md:pb-32')}>
      {/* BULK-ENTITY-FAVORITES-REMOVE-01: header + entry button. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{totalItems} عنصر محفوظ</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => (selectionMode ? clearSelection() : setSelectionMode(true))}
          className="h-9 rounded-full px-3.5 text-xs font-bold"
        >
          {selectionMode ? 'إلغاء التحديد' : 'تحديد'}
        </Button>
      </div>

      <div
        className={
          type === 'STORE'
            ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4 stagger-fade-in' /* FIX ENTLIST-GRID: Rule 11 */
            : 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 stagger-fade-in'
        }
      >
        {items.map((fav) => {
          const key = fav.entityId;
          const isSelected = selected.has(key);
          return (
            <div
              key={key}
              className="relative"
              onPointerDown={(event) => { longPressTargetIdRef.current = key; longPressHandlers.onPointerDown(event); }}
              onPointerMove={longPressHandlers.onPointerMove}
              onPointerUp={longPressHandlers.onPointerUp}
              onPointerCancel={longPressHandlers.onPointerCancel}
              onClickCapture={longPressHandlers.onClickCapture}
              onContextMenu={longPressHandlers.onContextMenu}
            >
              <div className={cn(selectionMode && 'pointer-events-none')}>
                <EntityCard type={type} entity={fav.entity} />
              </div>

              {selectionMode && (
                <button
                  type="button"
                  onClick={() => toggleSelect(key)}
                  aria-label={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                  role="checkbox"
                  aria-checked={isSelected}
                  className={cn(
                    'absolute inset-0 z-10 flex items-start justify-end rounded-2xl p-2.5 transition-colors',
                    isSelected && 'bg-primary/10 ring-2 ring-primary ring-inset',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-md border-2 bg-background shadow-sm',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border',
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.favorites}
          searchParams={{ type: sp.get('type') ?? undefined }}
        />
      )}

      {selectionMode && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/95 px-3 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-6 md:left-1/2 md:w-[min(36rem,calc(100%-2rem))] md:-translate-x-1/2 md:rounded-2xl md:border md:shadow-lg md:pb-3"
          role="toolbar"
          aria-label="أدوات تحديد المفضلة"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-bold">{selected.size} محدد</span>
              <button
                type="button"
                className="text-xs font-bold text-primary"
                onClick={selectAllVisible}
                disabled={bulkBusy !== null}
              >
                تحديد الكل ({items.length})
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full gap-1.5 rounded-xl border-destructive/30 font-bold text-destructive"
              onClick={() => setConfirmBulkRemove(true)}
              disabled={bulkBusy !== null || selected.size === 0}
            >
              {bulkBusy === 'remove' ? <Spinner size="xs" /> : null}
              إزالة المحدد
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkRemove}
        onOpenChange={setConfirmBulkRemove}
        title={`إزالة ${selected.size} عنصر من المفضلة؟`}
        description="سيُزال العنصر المحدد من كل القوائم. يمكنك إضافة أي عنصر مرة أخرى بضغطة ♡."
        confirmLabel="إزالة المحدد"
        destructive
        isPending={bulkBusy === 'remove'}
        onConfirm={() => void performBulkRemove()}
      />
    </div>
  );
}

function EntityCard({
  type,
  entity,
}: {
  type: FavoriteEntityKind;
  entity: FavoriteEntity;
}) {
  switch (type) {
    case 'PRODUCT': {
      const product = entity as ProductWithStore;
      return <ProductCard product={product} storeId={product.store.id} context="favorites" />;
    }
    case 'STORE':
      return <StoreCard store={entity as StoreWithSeller} context="favorites" />;
    case 'SERVICE_LISTING':
      return <ServiceListingCard listing={entity as ServiceListingWithProvider} context="favorites" />;
  }
}

function EntityCardSkeleton({ type }: { type: FavoriteEntityKind }) {
  switch (type) {
    case 'PRODUCT':
      return <ProductCardSkeleton />;
    case 'STORE':
      return <StoreCardSkeleton />;
    case 'SERVICE_LISTING':
      return <ServiceListingCardSkeleton />;
  }
}
