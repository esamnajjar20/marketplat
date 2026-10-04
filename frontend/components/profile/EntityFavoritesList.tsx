'use client';

import { ProductCard } from '@/components/stores/ProductCard';
import { StoreCard } from '@/components/stores/StoreCard';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { ProductCardSkeleton, StoreCardSkeleton, ServiceListingCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Pagination } from '@/components/shared/ui/Pagination';
import { Button } from '@/components/shared/ui/Button';
import { useFavoritesByType } from '@/hooks/queries/useFavorites';
import { useToggleFavoriteEntity } from '@/hooks/mutations/useFavoriteMutations';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Heart, AlertTriangle, Check, CheckSquare, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';
import type { FavoriteEntityKind } from '@/types/favorite.types';
import type { ProductWithStore } from '@/types/product.types';
import type { StoreWithSeller } from '@/types/store.types';
import type { ServiceListingWithProvider } from '@/types/service.types';

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
  // SW-FIX-PAGE-NAN: clamp URL page param to positive integer.
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
  const copy = EMPTY_COPY[type];

  // BULK-ENTITY-FAVORITES-REMOVE-01: same pattern as FavoritesList.tsx.
  // The hook is instantiated with the current `type`, so one bulk
  // action works for products, stores, and services without branching.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

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

  function selectAllVisible() {
    setSelected(new Set(items.map((f) => f.entityId)));
    setSelectionMode(true);
  }

  function onCardTouchStart(id: string) {
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      enterSelectionWith(id);
    }, 500);
  }
  function onCardTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
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
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <EntityCardSkeleton key={i} type={type} />)}
      </div>
    );
  }

  // Same UX-FIX P1-8 ordering as FavoritesList.tsx: a real fetch
  // failure must never be misread as "genuinely no favorites".
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل المفضلة</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="h-10 w-10" />}
        title={copy.title}
        description={copy.description}
        action={<Link href={copy.href}><Button variant="outline">{copy.cta}</Button></Link>}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* BULK-ENTITY-FAVORITES-REMOVE-01: header + entry button. */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {items.length} عنصر في هذه الصفحة
        </span>
        <Button
          type="button"
          variant={selectionMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => (selectionMode ? clearSelection() : setSelectionMode(true))}
          className="gap-1.5"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          {selectionMode ? 'إلغاء التحديد' : 'تحديد'}
        </Button>
      </div>

      {selectionMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
          <span className="font-medium">{selected.size} محدد</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={selectAllVisible}
            disabled={bulkBusy !== null}
          >
            تحديد الكل ({items.length})
          </Button>
          <div className="ms-auto flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => setConfirmBulkRemove(true)}
              disabled={bulkBusy !== null || selected.size === 0}
              className="gap-1.5"
            >
              {bulkBusy === 'remove' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Heart className="h-3.5 w-3.5" />
              )}
              إزالة المحدد
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              disabled={bulkBusy !== null}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div
        className={
          type === 'STORE'
            ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 stagger-fade-in' /* FIX ENTLIST-GRID: Rule 11 */
            : 'grid grid-cols-2 lg:grid-cols-3 gap-3 stagger-fade-in'
        }
      >
        {items.map((fav) => {
          const key = fav.entityId;
          const isSelected = selected.has(key);
          return (
            <div
              key={key}
              className="relative"
              onTouchStart={() => onCardTouchStart(key)}
              onTouchEnd={onCardTouchEnd}
              onTouchCancel={onCardTouchEnd}
              onMouseDown={(e) => { if (e.button === 0) onCardTouchStart(key); }}
              onMouseUp={onCardTouchEnd}
              onMouseLeave={onCardTouchEnd}
            >
              <div className={cn(selectionMode && 'pointer-events-none')}>
                <EntityCard type={type} entity={fav.entity} />
              </div>

              {selectionMode && (
                <button
                  type="button"
                  onClick={() => toggleSelect(key)}
                  aria-label={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                  aria-pressed={isSelected}
                  className={cn(
                    'absolute inset-0 z-10 flex items-start justify-end rounded-xl p-2 transition-colors',
                    isSelected && 'bg-primary/15 ring-2 ring-primary ring-inset',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background shadow',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/60',
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
