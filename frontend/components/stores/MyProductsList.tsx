'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, Eye, Package, AlertTriangle, Pause, Play } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { useDeleteProduct, useToggleProductStatus } from '@/hooks/mutations/useProductMutations';
import { useOwnedListPage, useOutOfRangeRedirect } from '@/hooks/useOwnedListPage';
import { ROUTES } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import type { ProductStatus } from '@/types/product.types';

const STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: 'نشط',
  PAUSED: 'متوقف',
  DELETED: 'محذوف',
};

/** Page/status/out-of-range-recovery logic shared with MyAdsList and
 * MyServiceListingsList — see useOwnedListPage. */
export function MyProductsList() {
  const { page, status, setStatus, searchParams: sp } = useOwnedListPage<ProductStatus>(ROUTES.myStoreProducts);

  const { data, isLoading, isError, refetch } = useMyProducts({ page, limit: 10, status });
  const deleteProduct = useDeleteProduct();
  const toggleStatus = useToggleProductStatus();

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const isOutOfRange = useOutOfRangeRedirect({
    baseUrl: ROUTES.myStoreProducts,
    page,
    totalPages: data?.meta?.totalPages,
    hasData: !!data,
    searchParams: sp,
  });

  if (isLoading || isOutOfRange) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل منتجاتك</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 border-b pb-3 overflow-x-auto flex-1" role="group" aria-label="تصفية المنتجات حسب الحالة">
          {([['', 'الكل'], ['ACTIVE', 'نشط'], ['PAUSED', 'متوقف'], ['DELETED', 'محذوف']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatus(val)}
              aria-pressed={(status ?? '') === val}
              className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors
                ${(status ?? '') === val ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Link href={ROUTES.myStoreProductCreate}>
          <Button size="sm">إضافة منتج</Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title="لا توجد منتجات"
          description="لم تضف أي منتج بعد"
          action={<Link href={ROUTES.myStoreProductCreate}><Button>إضافة منتج</Button></Link>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((product) => {
            const thumb = product.images[0] ? getThumbnailUrl(product.images[0], 120, 90) : PLACEHOLDER_SVG;
            return (
              <div key={product.id} className="flex gap-3 p-3 rounded-lg border bg-card">
                <div className="relative w-24 h-18 shrink-0 rounded overflow-hidden bg-muted">
                  <Image src={thumb} alt={product.name} fill className="object-cover" sizes="96px" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm line-clamp-1">{product.name}</span>
                    <Badge
                      variant={
                        product.status === 'ACTIVE' ? 'default'
                        : product.status === 'PAUSED' ? 'secondary'
                        : 'destructive'
                      }
                      className="shrink-0 text-xs"
                    >
                      {STATUS_LABELS[product.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-primary font-bold text-sm">
                      {formatPrice(product.discountPrice ?? product.price)}
                    </p>
                    {product.discountPrice && (
                      <p className="text-xs text-muted-foreground line-through">
                        {formatPrice(product.price)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{product.views}</span>
                    <span>{formatRelativeTime(product.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Link href={ROUTES.myStoreProductEdit(product.id)}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`تعديل ${product.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  {product.status !== 'DELETED' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={product.status === 'PAUSED' ? `إعادة تفعيل ${product.name}` : `إيقاف ${product.name} مؤقتاً`}
                      title={product.status === 'PAUSED' ? 'إعادة تفعيل' : 'إيقاف مؤقت'}
                      disabled={toggleStatus.isPending && toggleStatus.variables?.id === product.id}
                      onClick={() => toggleStatus.mutate({
                        id: product.id,
                        status: product.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED',
                      })}
                    >
                      {product.status === 'PAUSED'
                        ? <Play className="h-3.5 w-3.5 text-success" />
                        : <Pause className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label={`حذف ${product.name}`}
                    onClick={() => setDeleteTargetId(product.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.myStoreProducts}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="حذف المنتج؟"
        description="لا يمكن التراجع عن هذا الإجراء بعد التأكيد."
        confirmLabel="حذف"
        destructive
        isPending={deleteProduct.isPending}
        onConfirm={() => {
          if (!deleteTargetId) return;
          deleteProduct.mutate(deleteTargetId, { onSuccess: () => setDeleteTargetId(null) });
        }}
      />
    </div>
  );
}
