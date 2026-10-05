'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import {
  Pencil,
  Trash2,
  Eye,
  Package,
  AlertTriangle,
  Pause,
  Play,
  Tag,
  Layers,
  Search,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Input } from '@/components/shared/ui/Input';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { AdListItemSkeleton } from '@/components/shared/skeletons/AdListItemSkeleton';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { useDeleteProduct, useToggleProductStatus } from '@/hooks/mutations/useProductMutations';
import { useOwnedListPage, useOutOfRangeRedirect } from '@/hooks/useOwnedListPage';
import { ROUTES } from '@/lib/constants';
import { myStoreTabHref } from '@/lib/myStoreHubTabs';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import type { ProductAvailability, ProductStatus } from '@/types/product.types';

const STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: 'نشط',
  PAUSED: 'متوقف',
  DELETED: 'محذوف',
};

const AVAIL_LABELS: Record<ProductAvailability, string> = {
  IN_STOCK: 'متوفر',
  LIMITED: 'كمية محدودة',
  OUT_OF_STOCK: 'غير متوفر',
};

import { PendingOfflinePublishCard } from '@/components/offline/PendingOfflinePublishCard';
export function MyProductsList() {
  const router = useRouter();
  const { page, status, setStatus, searchParams: sp } = useOwnedListPage<ProductStatus>(ROUTES.myStore);
  const availability = (sp.get('availability') as ProductAvailability | null) || undefined;
  const searchQ = sp.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(searchQ);

  const { data, isLoading, isError, refetch } = useMyProducts({
    page,
    limit: 10,
    status,
    availability,
    search: searchQ || undefined,
  });
  const deleteProduct = useDeleteProduct();
  const toggleStatus = useToggleProductStatus();

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // BULK-PRODUCTS-DELETE-01: confirm dialog for deleting the current
  // selection. The existing selection toolbar only offered status
  // toggles; a seller who wants to clear five discontinued products
  // had to open each one and delete individually.
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const items = data?.items ?? [];
  const showPendingOffline = page === 1 && !status && !(sp.get('q') ?? '').trim();

  const totalPages = data?.meta?.totalPages ?? 1;

  const isOutOfRange = useOutOfRangeRedirect({
    baseUrl: ROUTES.myStore,
    page,
    totalPages: data?.meta?.totalPages,
    hasData: !!data,
    searchParams: sp,
  });

  function pushParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(sp.toString());
    mutator(params);
    params.delete('page');
    router.push(`${ROUTES.myStore}?${params.toString()}`);
  }

  function setAvailability(val: string) {
    pushParams((params) => {
      if (val) params.set('availability', val);
      else params.delete('availability');
    });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushParams((params) => {
      const q = searchInput.trim();
      if (q) params.set('q', q);
      else params.delete('q');
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkStatus(next: 'ACTIVE' | 'PAUSED') {
    setBulkBusy('status');
    try {
      for (const id of selected) {
        await toggleStatus.mutateAsync({ id, status: next });
      }
    } finally {
      setBulkBusy(null);
      setSelected(new Set());
    }
  }

  // BULK-PRODUCTS-DELETE-01: sequential delete of the current selection
  // — same concurrency-4 batching used on /my-ads, so a slow network
  // doesn't leave dozens of parallel requests in flight.
  async function performBulkDelete() {
    setConfirmBulkDelete(false);
    setBulkBusy('delete');
    const ids = Array.from(selected);
    const CONCURRENCY = 4;
    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const batch = ids.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((id) => deleteProduct.mutateAsync(id)),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') ok += 1; else fail += 1;
        }
      }
      const msg = fail > 0 ? `حُذف ${ok} (فشل ${fail})` : `حُذف ${ok} منتج`;
      toast.success(msg);
    } finally {
      setBulkBusy(null);
      setSelected(new Set());
    }
  }

  if (isLoading || isOutOfRange) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <AdListItemSkeleton key={i} />
        ))}
      </div>
    );
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
      {showPendingOffline && <PendingOfflinePublishCard kind="product" />}
      <form onSubmit={submitSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ابحث باسم المنتج…"
            className="ps-9"
            aria-label="بحث في المنتجات"
          />
        </div>
        <Button type="submit" variant="secondary">
          بحث
        </Button>
      </form>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 border-b pb-3 overflow-x-auto flex-1" role="group" aria-label="تصفية حسب الحالة">
          {([['', 'الكل'], ['ACTIVE', 'نشط'], ['PAUSED', 'متوقف'], ['DELETED', 'محذوف']] as const).map(
            ([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatus(val)}
                aria-pressed={(status ?? '') === val}
                className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors ${
                  (status ?? '') === val
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <Link href={ROUTES.myStoreProductCreate}>
          <Button size="sm">إضافة منتج</Button>
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="تصفية حسب التوفر">
        {(
          [
            ['', 'كل التوفر'],
            ['IN_STOCK', 'متوفر'],
            ['LIMITED', 'محدود'],
            ['OUT_OF_STOCK', 'نفد'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setAvailability(val)}
            aria-pressed={(availability ?? '') === val}
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
              (availability ?? '') === val
                ? 'bg-primary/10 border-primary text-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
          <span className="font-medium">{selected.size} محدد</span>
          <Button size="sm" variant="outline" onClick={() => bulkStatus('ACTIVE')} disabled={toggleStatus.isPending}>
            تفعيل
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkStatus('PAUSED')} disabled={bulkBusy !== null || toggleStatus.isPending}>
            إيقاف
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmBulkDelete(true)}
            disabled={bulkBusy !== null}
            className="gap-1.5"
          >
            {bulkBusy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            حذف المحدد
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkBusy !== null}>
            إلغاء التحديد
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title={searchQ || availability ? 'لا نتائج لهذا التصفية' : 'لا توجد منتجات'}
          description={
            searchQ || availability
              ? 'جرّب تغيير البحث أو فلاتر التوفر'
              : 'أضف منتجاتك ثم نظّمها في مجموعات أو أطلق عرضًا لجذب المشترين'
          }
          action={
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <Link href={ROUTES.myStoreProductCreate}>
                <Button>إضافة منتج</Button>
              </Link>
              {!searchQ && !availability && (
                <>
                  <Link href={ROUTES.myStoreCollections}>
                    <Button variant="outline" className="gap-1.5">
                      <Layers className="h-4 w-4" /> المجموعات
                    </Button>
                  </Link>
                  <Link href={ROUTES.myStorePromotions}>
                    <Button variant="outline" className="gap-1.5">
                      <Tag className="h-4 w-4" /> العروض
                    </Button>
                  </Link>
                </>
              )}
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((product) => {
            const thumb = product.images[0]
              ? getThumbnailUrl(product.images[0], 120, 90)
              : PLACEHOLDER_SVG;
            return (
              <div key={product.id} className="flex gap-3 p-3 rounded-lg border bg-card">
                {product.status !== 'DELETED' && (
                  <input
                    type="checkbox"
                    className="mt-1 shrink-0"
                    checked={selected.has(product.id)}
                    onChange={() => toggleSelect(product.id)}
                    aria-label={`تحديد ${product.name}`}
                  />
                )}
                <div className="relative w-24 h-18 shrink-0 rounded overflow-hidden bg-muted">
                  <SafeImage src={thumb} alt={product.name} fill className="object-cover" sizes="96px" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm line-clamp-1">{product.name}</span>
                    <Badge
                      variant={
                        product.status === 'ACTIVE'
                          ? 'default'
                          : product.status === 'PAUSED'
                            ? 'secondary'
                            : 'destructive'
                      }
                      className="shrink-0 text-xs"
                    >
                      {STATUS_LABELS[product.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-primary font-bold text-sm">
                      {formatPrice(product.discountPrice ?? product.price)}
                    </p>
                    {product.discountPrice && (
                      <p className="text-xs text-muted-foreground line-through">
                        {formatPrice(product.price)}
                      </p>
                    )}
                    <Badge variant="outline" className="text-2xs">
                      {AVAIL_LABELS[product.availability]}
                      {product.stockQuantity != null ? ` · ${product.stockQuantity}` : ''}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {product.views}
                    </span>
                    <span>{formatRelativeTime(product.createdAt)}</span>
                    {!product.images?.length && <span className="text-warning">بدون صور</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Link href={ROUTES.myStoreProductEdit(product.id)}>
                    <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`تعديل ${product.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  {product.status === 'ACTIVE' && (
                    <Link href={myStoreTabHref('promotions', { productId: product.id })}>
                      <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`عرض لـ ${product.name}`} title="إنشاء عرض">
                        <Tag className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  )}
                  {product.status !== 'DELETED' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      aria-label={product.status === 'PAUSED' ? `إعادة تفعيل ${product.name}` : `إيقاف ${product.name} مؤقتاً`}
                      disabled={toggleStatus.isPending && toggleStatus.variables?.id === product.id}
                      onClick={() =>
                        toggleStatus.mutate({
                          id: product.id,
                          status: product.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED',
                        })
                      }
                    >
                      {product.status === 'PAUSED' ? (
                        <Play className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Pause className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive hover:text-destructive"
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
          baseUrl={ROUTES.myStore}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
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

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`حذف ${selected.size} منتج؟`}
        description="لا يمكن التراجع عن هذا الإجراء بعد التأكيد."
        confirmLabel="حذف المحدد"
        destructive
        isPending={bulkBusy === 'delete'}
        onConfirm={() => void performBulkDelete()}
      />
    </div>
  );
}
