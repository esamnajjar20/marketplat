'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tag, Plus, AlertTriangle, XCircle } from 'lucide-react';
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
            return (
              <div key={promotion.id} className="flex flex-col gap-2 p-3 rounded-lg border bg-card sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
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
    </div>
  );
}
