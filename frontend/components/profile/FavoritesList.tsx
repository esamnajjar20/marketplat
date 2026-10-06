'use client';
import { useLongPress } from '@/hooks/ui/useLongPress';

import Link from 'next/link';
import { AdCard } from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState }    from '@/components/shared/feedback/EmptyState';
import { Pagination }    from '@/components/shared/ui/Pagination';
import { useFavorites }  from '@/hooks/queries/useFavorites';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Heart, HeartOff, AlertTriangle, Check, CheckSquare, Loader2, X } from 'lucide-react';
import { MoveSelectedToListMenu } from '@/components/favorites/MoveSelectedToListMenu';
import { Button }        from '@/components/shared/ui/Button';
import { ROUTES }        from '@/lib/constants';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { cn }            from '@/lib/utils';

export function FavoritesList() {
  const sp   = useSearchParams();
  // clamp URL page param to positive integer.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const listId = sp.get('list') || undefined;
  const { data, isLoading, isError, refetch } = useFavorites({ page, listId });
  const toggleFavorite = useToggleFavorite();

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const totalItems = data?.meta?.total ?? items.length;

  // BULK-FAVORITES-REMOVE-01: multi-select for bulk remove. Items are
  // grid cards, not rows, so the checkbox is an overlay button that
  // covers the card while selection mode is on; the card itself gets
  // pointer-events-none so its link can't navigate.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setSelectionMode(false);
  }, [page, listId]);


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
    // Deleted-ads still get a checkbox — they're the ones most likely
    // to need cleanup in bulk.
    setSelected(new Set(items.map((f) => f.ad.id)));
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
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => <AdCardSkeleton key={i} />)}
      </div>
    );
  }

  // `items = data?.items ?? []` meant a failed fetch fell
  // straight into the items.length === 0 branch below and showed "لا
  // توجد إعلانات محفوظة" (no favorites) — misleading for a user who
  // genuinely has saved ads but hit a network/server error. isError is
  // checked first so a real fetch failure can never be misread as an
  // empty list.
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
        icon={<HeartOff className="h-10 w-10" />}
        title="لا توجد إعلانات محفوظة"
        description="اضغط ♡ على أي إعلان أثناء التصفح ليظهر هنا لاحقاً — مفيد لمقارنة الخيارات قبل التواصل."
        action={
          <div className="flex flex-col items-center gap-2 sm:flex-row">
            <Button asChild size="sm">
              {/* SW-FIX-FAV-PREFETCH-MALFORM: `prefetch={false}` was on the
                  line after </Link> — as JSX text it rendered the literal
                  "prefetch=" above the button. Same malformed pattern fixed
                  in RecentAds/ConversationList/EmptySearchAlternatives. */}
              <Link prefetch={false} href={`${ROUTES.search}?type=ads`}>تصفّح الإعلانات</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={ROUTES.home}>العودة للرئيسية</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* BULK-FAVORITES-REMOVE-01: header row + selection entry. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {totalItems} عنصر محفوظ
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
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-2.5 text-sm" role="toolbar" aria-label="أدوات تحديد المفضلة">
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
          <div className="ms-auto flex flex-wrap gap-2">
            <MoveSelectedToListMenu
              favoriteIds={items.filter((fav) => selected.has(fav.ad.id)).map((fav) => fav.id)}
              currentListId={listId}
              disabled={bulkBusy !== null || selected.size === 0}
            />
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
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 stagger-fade-in">
        {items.map((fav) => {
          const key = fav.ad.id;
          const isSelected = selected.has(key);
          // EPIC 1.4: a favorited ad that was later deleted by its
          // owner (or an admin) still comes back from GET /favorites —
          // the backend never filters DELETED out, it just reports the
          // real status. In selection mode it is still selectable: the
          // whole point of this feature is to make cleaning up a
          // favorites list that has accumulated dead entries possible
          // in one action.
          return (
            <div
              key={fav.id ?? fav.ad.id}
              className="relative"
              onPointerDown={(event) => { longPressTargetIdRef.current = key; longPressHandlers.onPointerDown(event); }}
              onPointerMove={longPressHandlers.onPointerMove}
              onPointerUp={longPressHandlers.onPointerUp}
              onPointerCancel={longPressHandlers.onPointerCancel}
              onClickCapture={longPressHandlers.onClickCapture}
              onContextMenu={longPressHandlers.onContextMenu}
            >
              <div className={cn('flex flex-col gap-2', selectionMode && 'pointer-events-none')}>
                {fav.ad.status === 'DELETED' ? (
                  <DeletedFavoriteCard adId={fav.ad.id} title={fav.ad.title} />
                ) : (
                  <>
                    <AdCard ad={fav.ad} context="favorites" />
                  </>
                )}
              </div>

              {selectionMode && (
                <button
                  type="button"
                  onClick={() => toggleSelect(key)}
                  aria-label={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                  role="checkbox" aria-checked={isSelected}
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
        <Pagination totalPages={totalPages} currentPage={page} baseUrl="/favorites" />
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

/**
 * EPIC 1.4: non-navigable placeholder for a favorited ad whose owner
 * (or an admin) deleted it. Deliberately not a <Link> — the ad detail
 * page for a DELETED ad genuinely 404s (see ads.service.ts), so a
 * clickable card here would just move the surprise from "silent 404
 * after a click" to "a click that looks live but goes nowhere useful."
 * Shows a clear reason and a direct way to clean it up from the list.
 */
function DeletedFavoriteCard({ adId, title }: { adId: string; title: string }) {
  const toggleFavorite = useToggleFavorite();

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-dashed bg-muted/30 opacity-75">
      <div className="flex aspect-[4/3] items-center justify-center bg-muted">
        <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
          تم حذف الإعلان
        </span>
      </div>
      <div className="space-y-2 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-muted-foreground">
          {title}
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={toggleFavorite.isPending}
          onClick={() => toggleFavorite.mutate(adId)}
        >
          {toggleFavorite.isPending ? 'جارٍ الإزالة…' : 'إزالة من المفضلة'}
        </Button>
      </div>
    </div>
  );
}
