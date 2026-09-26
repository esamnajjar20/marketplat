'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Pencil, Trash2, Eye, CheckCircle, Check, X, CheckSquare, Loader2 } from 'lucide-react';
import { Button }       from '@/components/shared/ui/Button';
import { PinAdButton } from '@/components/ads/PinAdButton';
import { RepublishAdButton } from '@/components/ads/RepublishAdButton';
import { Badge }        from '@/components/shared/ui/Badge';
import { Pagination }   from '@/components/shared/ui/Pagination';
import { EmptyState }   from '@/components/shared/feedback/EmptyState';
import { AdListItemSkeleton } from '@/components/shared/skeletons/AdListItemSkeleton';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useMyAds }     from '@/hooks/queries/useAds';
import { useDeleteAd, useMarkAsSold } from '@/hooks/mutations/useAdMutations';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useOwnedListPage, useOutOfRangeRedirect } from '@/hooks/useOwnedListPage';
import { ROUTES, STATUS_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { AD_STATUS_VARIANT } from '@/lib/adStatus';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { ShoppingBag, AlertTriangle } from 'lucide-react';
import type { AdStatus } from '@/types/ad.types';

export function MyAdsList() {
  // Page/status logic shared with MyServiceListingsList and
  // MyProductsList — see useOwnedListPage.
  const { page, status, setStatus, searchParams: sp } = useOwnedListPage<AdStatus>(ROUTES.myAds);

  const { data, isLoading, isError, refetch } = useMyAds({ page, limit: 10, status });
  const deleteAd   = useDeleteAd();
  const queryClient = useQueryClient();
  const pendingDeletes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** PHASE-2: optimistic hide + 10s undo, then real DELETE. */
  function scheduleDelete(adId: string) {
    const existing = pendingDeletes.current.get(adId);
    if (existing) clearTimeout(existing);

    // Soft-hide from all my-ads list caches
    queryClient.setQueriesData({ queryKey: ['ads', 'me'] }, (old: unknown) => {
      if (!old || typeof old !== 'object') return old;
      const o = old as { items?: { id: string }[]; data?: { items?: { id: string }[] } };
      if (Array.isArray((o as { items?: unknown }).items)) {
        return {
          ...o,
          items: (o as { items: { id: string }[] }).items.filter((a) => a.id !== adId),
        };
      }
      return old;
    });

    const timer = setTimeout(() => {
      pendingDeletes.current.delete(adId);
      deleteAd.mutate(adId);
    }, 10_000);
    pendingDeletes.current.set(adId, timer);

    toast.success('تم حذف الإعلان', {
      duration: 10_000,
      action: {
        label: 'تراجع',
        onClick: () => {
          const t = pendingDeletes.current.get(adId);
          if (t) clearTimeout(t);
          pendingDeletes.current.delete(adId);
          void queryClient.invalidateQueries({ queryKey: queryKeys.ads.mine() });
          toast.message('تم التراجع عن الحذف');
        },
      },
    });
  }

  const markAsSold = useMarkAsSold();

  // BULK-ADS-01-STATE: multi-select mode for the ads list. Long-press
  // (>500ms) any row enters selection mode; tap toggles. Sticky bar
  // at the bottom runs bulk mark-as-sold / bulk delete.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

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

  function onRowTouchStart(id: string) {
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      enterSelectionWith(id);
    }, 500);
  }

  function onRowTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function onRowClick(id: string) {
    if (longPressFired.current) { longPressFired.current = false; return; }
    if (selectionMode) toggleSelect(id);
  }

  // Tracks which ad the delete-confirmation dialog applies to (null = closed).
  // UX-FIX: "تعليم كمباع" changes the ad's status platform-wide (removed
  // from active search/listings) with no easy undo path, same class of
  // action as delete — but previously fired straight from onClick with
  // zero confirmation, inconsistent with delete's ConfirmDialog just
  // below. Mirrors the same controlled-target pattern.
  const [soldTargetId, setSoldTargetId] = useState<string | null>(null);

  // BULK-ADS-01-FN: bulk actions. Backend has no bulk endpoints, so we
  // loop through ids with Promise.allSettled limited to 4 parallel —
  // enough to feel instant, low enough not to slam the API on a weak
  // network. Only ACTIVE ads can be marked sold (backend refuses
  // otherwise); we filter the selection here and report the count.
  async function bulkMarkSold() {
    setBulkBusy('sold');
    const ids = Array.from(selected);
    // Only ACTIVE ads can transition to SOLD; skip others silently.
    const eligible = ids.filter((id) => {
      const ad = items.find((a) => a.id === id);
      return ad?.status === 'ACTIVE';
    });
    if (eligible.length === 0) {
      toast.info('لا يوجد إعلانات نشطة في التحديد');
      setBulkBusy(null);
      return;
    }
    const CONCURRENCY = 4;
    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < eligible.length; i += CONCURRENCY) {
        const batch = eligible.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((id) => markAsSold.mutateAsync(id)),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') ok += 1; else fail += 1;
        }
      }
      const skipped = ids.length - eligible.length;
      const parts = [`عُلّم ${ok} كمباع`];
      if (fail > 0) parts.push(`فشل ${fail}`);
      if (skipped > 0) parts.push(`تجاوزنا ${skipped}`);
      toast.success(parts.join(' · '));
    } finally {
      setBulkBusy(null);
      clearSelection();
    }
  }

  async function bulkDelete() {
    setConfirmBulkDelete(false);
    setBulkBusy('delete');
    const ids = Array.from(selected);
    const CONCURRENCY = 4;
    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const batch = ids.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((id) => deleteAd.mutateAsync(id)),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') ok += 1; else fail += 1;
        }
      }
      const parts = [`حُذف ${ok}`];
      if (fail > 0) parts.push(`فشل ${fail}`);
      toast.success(parts.join(' · '));
    } finally {
      setBulkBusy(null);
      clearSelection();
    }
  }

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  // Out-of-range-page recovery — shared with MyServiceListingsList and
  // MyProductsList. See useOwnedListPage.ts (was FIX I-09 here originally).
  const isOutOfRange = useOutOfRangeRedirect({
    baseUrl: ROUTES.myAds,
    page,
    totalPages: data?.meta?.totalPages,
    hasData: !!data,
    searchParams: sp,
  });

  // FIX P1-9: LoadingSpinner previously wiped the whole list (title,
  // status tabs area stayed, but the row area went to a single
  // centered spinner) then popped the real rows back in — a jarring
  // "erase and redraw" that reads as slower than it is and loses all
  // visual context. AdListItemSkeleton already exists (used by
  // SearchResults' list view) and matches this exact row shape
  // (thumbnail + title + price + meta), so five of them stand in for
  // the rows about to load instead of blanking the area.
  if (isLoading || isOutOfRange) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <AdListItemSkeleton key={i} />)}
      </div>
    );
  }

  // UX-FIX P1-9: `items = data?.items ?? []` meant a failed fetch fell
  // straight into the items.length === 0 empty state ("لم تنشر أي
  // إعلانات بعد") — actively misleading for a seller who has real ads
  // but hit a network/server error, since it reads as "your ads are
  // gone" rather than "we couldn't load them". Checked after the
  // isOutOfRange redirect-in-progress case above, since that one still
  // needs `data` to have resolved successfully first.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل إعلاناتك</p>
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

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      {/* BULK-ADS-01-JSX */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-3">
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="تصفية الإعلانات حسب الحالة">
          {([['', 'الكل'], ['ACTIVE', 'نشطة'], ['SOLD', 'مباعة'], ['DELETED', 'محذوفة']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setStatus(val)}
              aria-pressed={(status ?? '') === val}
              className={`shrink-0 rounded-full px-3 py-1 text-sm transition-colors ${
                (status ?? '') === val
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant={selectionMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => (selectionMode ? clearSelection() : setSelectionMode(true))}
          className="ms-auto shrink-0 gap-1.5"
        >
          <CheckSquare className="h-3.5 w-3.5" />
          {selectionMode ? 'إلغاء التحديد' : 'تحديد'}
        </Button>
      </div>

      {items.length === 0 ? (
        // UX-FIX: "لم تنشر أي إعلانات بعد" was shown for every filter tab,
        // including SOLD/DELETED — misleading for a seller who has active
        // ads but is looking at an empty "مباعة" or "محذوفة" tab, since it
        // reads as "you have no ads at all" rather than "none in this
        // filter". The publish-ad CTA is also only relevant for the
        // "no ads at all" case (status === ''), not the filtered ones.
        <EmptyState icon={<ShoppingBag className="h-8 w-8" />}
          title="لا توجد إعلانات"
          description={
            !status ? 'لم تنشر أي إعلانات بعد'
            : status === 'ACTIVE' ? 'لا توجد إعلانات نشطة حالياً'
            : status === 'SOLD' ? 'لم تُعلّم أي إعلانات كمباعة بعد'
            : 'لا توجد إعلانات محذوفة'
          }
          action={!status ? <Link href={ROUTES.adCreate}><Button>نشر إعلان</Button></Link> : undefined} />
      ) : (
        <div className="space-y-3">
          {items.map((ad) => {
            const thumb = ad.images[0] ? getThumbnailUrl(ad.images[0], 120, 90) : PLACEHOLDER_SVG;
            return (
              <div
                key={ad.id}
                onTouchStart={() => onRowTouchStart(ad.id)}
                onTouchEnd={onRowTouchEnd}
                onTouchCancel={onRowTouchEnd}
                onMouseDown={(e) => { if (e.button === 0) onRowTouchStart(ad.id); }}
                onMouseUp={onRowTouchEnd}
                onMouseLeave={onRowTouchEnd}
                onClick={() => onRowClick(ad.id)}
                className={cn(
                  'flex gap-3 rounded-xl border border-border bg-card p-3 shadow-xs transition-colors',
                  selected.has(ad.id) ? 'border-primary/40 bg-primary/10' : 'hover:border-primary/20',
                  selectionMode && 'cursor-pointer',
                )}
              >
                {(selectionMode || selected.has(ad.id)) && (
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center self-center rounded border-2',
                      selected.has(ad.id)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40',
                    )}
                  >
                    {selected.has(ad.id) && <Check className="h-3.5 w-3.5" />}
                  </span>
                )}
                <div className="relative w-24 h-18 shrink-0 rounded overflow-hidden bg-muted">
                  <SafeImage src={thumb} alt={ad.title} fill className="object-cover" sizes="96px" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={ROUTES.adDetail(ad.id)} prefetch={false} className="font-medium text-sm hover:underline line-clamp-1">{ad.title}</Link>
                    <Badge variant={AD_STATUS_VARIANT[ad.status]} className="shrink-0 text-xs">
                      {STATUS_LABELS[ad.status]}
                    </Badge>
                  </div>
                  <p className="text-primary font-bold text-sm">{formatPrice(ad.price)}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{ad.views}</span>
                    <span>{formatRelativeTime(ad.createdAt)}</span>
                  </div>
                </div>
                <div className={cn('flex flex-col gap-1 shrink-0', selectionMode && 'hidden')}>
                  {/* FIX A11Y-01: icon-only action buttons need an
                      accessible name — title alone isn't reliable for
                      screen readers and has no keyboard equivalent. */}
                  {ad.status === 'ACTIVE' && (
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-success hover:text-success"
                      title="تعليم كمباع" aria-label={`تعليم ${ad.title} كمباع`}
                      /* UX-FIX P2-1: markAsSold is a single mutation hook
                         instance shared across every row in this list, so
                         a bare `markAsSold.isPending` disabled every row's
                         button while any one ad's request was in flight —
                         unlike MyProductsList/MyServiceListingsList, which
                         scope the same shared-hook pattern to the specific
                         row via `.variables`. mutationFn here takes the
                         adId directly (not an object), so `.variables` IS
                         the id — compare it straight to ad.id. */
                      disabled={markAsSold.isPending && markAsSold.variables === ad.id}
                      onClick={() => setSoldTargetId(ad.id)}>
                      <CheckCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {ad.status === 'ACTIVE' && (
                    <PinAdButton adId={ad.id} isPinned={Boolean(ad.isPinned)} />
                  )}
                  <RepublishAdButton adId={ad.id} status={ad.status} />
                  <Link href={ROUTES.adEdit(ad.id)} prefetch={false}>
                    <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`تعديل ${ad.title}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:text-destructive"
                    aria-label={`حذف ${ad.title}`}
                    onClick={() => scheduleDelete(ad.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          baseUrl={ROUTES.myAds} searchParams={Object.fromEntries(sp.entries())} />
      )}

      {/* BULK-ADS-01-JSX: sticky action bar appears in selection mode.
          Positioned above the mobile bottom nav (bottom-20) so it doesn't
          fight with the tab bar; on sm+ it hugs a max-w-md centered box. */}
      {selectionMode && (
        <div className="fixed inset-x-3 bottom-20 z-30 mx-auto flex max-w-md flex-wrap items-center gap-2 rounded-2xl border bg-background/95 px-3 py-3 shadow-2xl backdrop-blur">
          <span className="text-sm font-medium">{selected.size} محدد</span>
          <div className="ms-auto flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void bulkMarkSold()}
              disabled={bulkBusy !== null || selected.size === 0}
              className="gap-1.5"
            >
              {bulkBusy === 'sold' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              كمباع
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulkBusy !== null || selected.size === 0}
              className="gap-1.5"
            >
              {bulkBusy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              حذف
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearSelection}
              disabled={bulkBusy !== null}
              aria-label="إلغاء التحديد"
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`حذف ${selected.size} إعلان؟`}
        description="سيُحذف الإعلان المحدد نهائياً. لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف المحدد"
        destructive
        isPending={bulkBusy === 'delete'}
        onConfirm={() => void bulkDelete()}
      />

      {/* delete uses scheduleDelete + undo toast (PHASE-2) */}

      {/* UX-FIX: confirmation for "تعليم كمباع" — same pending-aware
          pattern as the delete dialog above (close only on confirmed
          success, disabled while in flight). */}
      <ConfirmDialog
        open={soldTargetId !== null}
        onOpenChange={(open) => { if (!open) setSoldTargetId(null); }}
        title="تعليم الإعلان كمباع؟"
        description="سيُخفى الإعلان من نتائج البحث والقوائم النشطة. يمكنك مراجعة الإعلانات المباعة من تبويب «مباعة»."
        confirmLabel="تعليم كمباع"
        isPending={markAsSold.isPending && markAsSold.variables === soldTargetId}
        onConfirm={() => {
          if (!soldTargetId) return;
          markAsSold.mutate(soldTargetId, { onSuccess: () => setSoldTargetId(null) });
        }}
      />
    </div>
  );
}
