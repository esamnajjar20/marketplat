'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tag, Plus, AlertTriangle, XCircle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { AdListItemSkeleton } from '@/components/shared/skeletons/AdListItemSkeleton';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { PromotionForm } from './PromotionForm';
import { useMyPromotions } from '@/hooks/queries/usePromotions';
import { useCancelPromotion } from '@/hooks/mutations/usePromotionMutations';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { formatPrice, formatDateTime } from '@/lib/formatters';
import type { Promotion, PromotionStatus } from '@/types/promotion.types';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<PromotionStatus, string> = {
  DRAFT: 'مسودة',
  SCHEDULED: 'مجدول',
  ACTIVE: 'نشط',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغى',
};

const STATUS_VARIANTS: Record<PromotionStatus, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  DRAFT: 'secondary',
  SCHEDULED: 'warning',
  ACTIVE: 'success',
  EXPIRED: 'secondary',
  CANCELLED: 'destructive',
};

function discountLabel(promotion: Promotion): string {
  return promotion.discountType === 'PERCENTAGE'
    ? `${promotion.discountValue}%`
    : formatPrice(promotion.discountValue);
}

/**
 * PROMO-1: store-owner promotions tab — mirrors MyProductsList.tsx's
 * structure (skeleton/error/empty states, row actions), simplified
 * since this MVP has no pagination (a store's promotion count is
 * expected to stay small — see the original design doc's Phase 7)
 * and no per-row edit (see PromotionForm.tsx's doc comment on why
 * cancel-and-recreate is the only mutation path after creation).
 */
export function MyPromotionsList() {
  const searchParams = useSearchParams();
  const productIdFromUrl = searchParams.get('productId') ?? undefined;
  const { data: promotions, isLoading, isError, refetch } = useMyPromotions();
  // Needed to resolve productId -> product name for display, since
  // promotions.api.ts's list endpoint returns the bare Promotion shape
  // (no nested product — see promotions.controller.ts) and there is no
  // dedicated products-by-id-batch endpoint to avoid over-building for
  // what is, per row, a single lookup against an already-cached list.
  const { data: productsPage } = useMyProducts({ limit: 100 });
  const products = productsPage?.items ?? [];

  const cancelPromotion = useCancelPromotion();
  const [formOpen, setFormOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  // BULK-PROMOTIONS-CANCEL-01: same selection UX used on products and
  // services. A store owner who ran a seasonal sale on five products
  // and wants it over had to cancel each promotion one by one. Only
  // ACTIVE / SCHEDULED promotions can be selected — once cancelled, a
  // promotion is terminal (no un-cancel endpoint), so including them
  // in a bulk cancel would be a confusing no-op.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkCancel, setConfirmBulkCancel] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllCancellable(items: Promotion[]) {
    const ids = items
      .filter((p) => p.status === 'ACTIVE' || p.status === 'SCHEDULED')
      .map((p) => p.id);
    setSelected(new Set(ids));
  }

  async function performBulkCancel() {
    setConfirmBulkCancel(false);
    setBulkBusy('cancel');
    const ids = Array.from(selected);
    const CONCURRENCY = 4;
    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const batch = ids.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((id) => cancelPromotion.mutateAsync(id)),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') ok += 1; else fail += 1;
        }
      }
      const msg = fail > 0 ? `أُلغي ${ok} (فشل ${fail})` : `أُلغي ${ok} عرض`;
      // Lazy import keeps the sonner dependency out of the initial
      // module graph of this otherwise tree-shakeable component.
      const { toast } = await import('sonner');
      toast.success(msg);
    } finally {
      setBulkBusy(null);
      setSelected(new Set());
    }
  }

  useEffect(() => {
    if (productIdFromUrl) setFormOpen(true);
  }, [productIdFromUrl]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <AdListItemSkeleton key={i} />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل العروض</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const items = promotions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold">العروض</h2>
        <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />إنشاء عرض
        </Button>
      </div>

      {/* BULK-PROMOTIONS-CANCEL-01: selection bar. Only shows when at
          least one cancellable promotion is selected. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
          <span className="font-medium">{selected.size} محدد</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => selectAllCancellable(items)}
            disabled={bulkBusy !== null}
          >
            تحديد كل القابلة للإلغاء
          </Button>
          <div className="ms-auto flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => setConfirmBulkCancel(true)}
              disabled={bulkBusy !== null}
              className="gap-1.5"
            >
              {bulkBusy === 'cancel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              إلغاء المحدد
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              disabled={bulkBusy !== null}
            >
              إلغاء التحديد
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-10 w-10" />}
          title="لا توجد عروض"
          description="أنشئ عرضاً على أحد منتجاتك لجذب المزيد من المشترين"
          action={<Button onClick={() => setFormOpen(true)}>إنشاء عرض</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((promotion) => {
            const product = products.find((p) => p.id === promotion.productId);
            const cancellable =
              promotion.status === 'ACTIVE' || promotion.status === 'SCHEDULED';
            const isSelected = selected.has(promotion.id);
            return (
              <div
                key={promotion.id}
                className={cn(
                  'flex flex-col gap-2 p-3 rounded-lg border bg-card sm:flex-row sm:items-center sm:justify-between',
                  isSelected && 'border-primary/40 bg-primary/5',
                )}
              >
                {cancellable && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`تحديد ${promotion.title}`}
                    onClick={() => toggleSelect(promotion.id)}
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center self-start rounded border-2 sm:self-center',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40',
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </button>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{promotion.title}</span>
                    <Badge variant={STATUS_VARIANTS[promotion.status]} className="text-xs">
                      {STATUS_LABELS[promotion.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {product?.name ?? 'منتج محذوف'} · خصم {discountLabel(promotion)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(promotion.startsAt)} — {formatDateTime(promotion.endsAt)}
                  </p>
                </div>
                {(promotion.status === 'ACTIVE' || promotion.status === 'SCHEDULED') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive shrink-0"
                    onClick={() => setCancelTargetId(promotion.id)}
                  >
                    <XCircle className="h-3.5 w-3.5" />إلغاء
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <PromotionForm open={formOpen} onOpenChange={setFormOpen} initialProductId={productIdFromUrl} />

      <ConfirmDialog
        open={cancelTargetId !== null}
        onOpenChange={(open) => { if (!open) setCancelTargetId(null); }}
        title="إلغاء العرض؟"
        description="سيتوقف الخصم فوراً عن الظهور للمشترين. لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="إلغاء العرض"
        destructive
        isPending={cancelPromotion.isPending}
        onConfirm={() => {
          if (!cancelTargetId) return;
          cancelPromotion.mutate(cancelTargetId, { onSuccess: () => setCancelTargetId(null) });
        }}
      />

      <ConfirmDialog
        open={confirmBulkCancel}
        onOpenChange={setConfirmBulkCancel}
        title={`إلغاء ${selected.size} عرض؟`}
        description="سيتوقف الخصم فوراً عن الظهور للمشترين. لا يمكن التراجع — سيحتاج المتجر لإنشاء عروض جديدة."
        confirmLabel="إلغاء المحدد"
        destructive
        isPending={bulkBusy === 'cancel'}
        onConfirm={() => void performBulkCancel()}
      />
    </div>
  );
}
