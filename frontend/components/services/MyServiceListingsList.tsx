'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import {
  Pencil,
  Trash2,
  Eye,
  Briefcase,
  AlertTriangle,
  Pause,
  Play,
  Search,
  Inbox,
  CalendarClock,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Input } from '@/components/shared/ui/Input';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { AdListItemSkeleton } from '@/components/shared/skeletons/AdListItemSkeleton';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { AddSaleDialog, type SalePrefill } from '@/components/sales/AddSaleDialog';
import { useMyServiceListings } from '@/hooks/queries/useServiceListings';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';
import {
  useDeleteServiceListing,
  useToggleServiceListingStatus,
} from '@/hooks/mutations/useServiceListingMutations';
import { useOwnedListPage, useOutOfRangeRedirect } from '@/hooks/useOwnedListPage';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime, formatServicePrice } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import type { ServiceListingStatus } from '@/types/service.types';

const STATUS_LABELS: Record<ServiceListingStatus, string> = {
  ACTIVE: 'نشطة',
  PAUSED: 'متوقفة',
  DELETED: 'محذوفة',
};

import { PendingOfflinePublishCard } from '@/components/offline/PendingOfflinePublishCard';
export function MyServiceListingsList() {
  const [salePrefill, setSalePrefill] = useState<SalePrefill | null>(null);
  const router = useRouter();
  const { data: provider, isSuccess: providerOk } = useMyServiceProvider();
  const { page, status, setStatus, searchParams: sp } = useOwnedListPage<ServiceListingStatus>(
    ROUTES.myServices,
  );
  const searchQ = sp.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(searchQ);

  const hasProvider = providerOk && Boolean(provider);
  const { data, isLoading, isError, refetch } = useMyServiceListings(
    {
      page,
      limit: 10,
      status,
      search: searchQ || undefined,
    },
    { enabled: hasProvider },
  );

  const deleteListing = useDeleteServiceListing();
  const toggleStatus = useToggleServiceListingStatus();

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // BULK-SERVICES-DELETE-01: same pattern as /my-store/products. The
  // toolbar offered only status toggles; a seller clearing five
  // discontinued services had to open each one individually.
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const isOutOfRange = useOutOfRangeRedirect({
    baseUrl: ROUTES.myServices,
    page,
    totalPages: data?.meta?.totalPages,
    hasData: !!data,
    searchParams: sp,
  });

  // FIX HOOK-ORDER-01: this useEffect was previously placed below the
  // early return in `if (!hasProvider) return null;` — which is a
  // rules-of-hooks violation (React requires every hook to run in the
  // same order on every render, and a conditional early return before
  // a hook means the hook does not run when the condition is met).
  // The effect itself only depends on values available before the
  // return (status, searchQ, page — all destructured/derived above),
  // so it is safe to move up.
  //
  // FIX SELECTION-ACROSS-FILTERS: the visible set changes whenever
  // the user switches a status tab, runs a new search, or moves to
  // a different page, but `selected` was never cleared. A user who
  // ticked five rows on the ACTIVE tab and then switched to PAUSED
  // still had those five ticked — invisible, but the bulk buttons
  // would silently mutate them anyway. Reset on every parameter
  // change that alters what the list is showing.
  useEffect(() => {
    setSelected(new Set());
  }, [status, searchQ, page]);

  // Hub shows BecomeServiceProviderCard; hide list until a provider exists.
  if (!hasProvider) return null;

  const items = data?.items ?? [];
  const showPendingOffline = page === 1 && !status && !(sp.get('q') ?? '').trim();

  const totalPages = data?.meta?.totalPages ?? 1;

  function pushParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(sp.toString());
    mutator(params);
    params.delete('page');
    router.push(`${ROUTES.myServices}?${params.toString()}`);
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
    // FIX BULK-STATUS-UNHANDLED: the loop previously ran with no
    // try/catch and no toast. A single failure (403, 500, network
    // drop) aborted the loop, leaked an unhandled promise rejection
    // into the console, and left the user with a partially-applied
    // bulk operation and no explanation — some rows updated, some
    // not, selection still populated. Now the loop is wrapped, a
    // summary toast surfaces the failure, and selection is
    // deliberately preserved on failure so the user can see which
    // items they still need to retry.
    setBulkBusy('status');
    const ids = Array.from(selected);
    try {
      for (const id of ids) {
        await toggleStatus.mutateAsync({ id, status: next });
      }
    } catch {
      toast.error('تعذّر تحديث بعض الخدمات، حاول مرة أخرى');
      return;
    } finally {
      setBulkBusy(null);
    }
    setSelected(new Set());
    toast.success(`تم تحديث ${ids.length} خدمة`);
  }

  // BULK-SERVICES-DELETE-01: sequential delete of the current selection,
  // batched at concurrency 4 to match the ads / products lists.
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
          batch.map((id) => deleteListing.mutateAsync(id)),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') ok += 1; else fail += 1;
        }
      }
      const msg = fail > 0 ? `حُذف ${ok} (فشل ${fail})` : `حُذف ${ok} خدمة`;
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
        <p className="text-destructive">حدث خطأ أثناء تحميل خدماتك</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showPendingOffline && <PendingOfflinePublishCard kind="service" />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-muted-foreground">قائمة الخدمات</h2>
        <Link href={ROUTES.myServiceCreate}>
          <Button size="sm">خدمة جديدة</Button>
        </Link>
      </div>

      <form onSubmit={submitSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ابحث بعنوان الخدمة…"
            className="ps-9"
            aria-label="بحث في الخدمات"
          />
        </div>
        <Button type="submit" variant="secondary">
          بحث
        </Button>
      </form>

      <div
        className="flex gap-2 border-b pb-3 overflow-x-auto"
        role="group"
        aria-label="تصفية الخدمات حسب الحالة"
      >
        {([['', 'الكل'], ['ACTIVE', 'نشطة'], ['PAUSED', 'متوقفة'], ['DELETED', 'محذوفة']] as const).map(
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

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
          <span className="font-medium">{selected.size} محدد</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkStatus('ACTIVE')}
            disabled={toggleStatus.isPending}
          >
            تفعيل
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkStatus('PAUSED')}
            disabled={bulkBusy !== null || toggleStatus.isPending}
          >
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
          icon={<Briefcase className="h-10 w-10" />}
          title={searchQ ? 'لا نتائج لهذا البحث' : 'لا توجد خدمات'}
          description={
            searchQ
              ? 'جرّب تغيير كلمة البحث أو فلاتر الحالة'
              : 'أضف خدمة ثم تابع الطلبات الواردة واحجز المواعيد مع العملاء'
          }
          action={
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <Link href={ROUTES.myServiceCreate}>
                <Button>إضافة خدمة</Button>
              </Link>
              {!searchQ && (
                <>
                  <Link href={ROUTES.incomingServiceRequests}>
                    <Button variant="outline" className="gap-1.5">
                      <Inbox className="h-4 w-4" /> الطلبات
                    </Button>
                  </Link>
                  <Link href={ROUTES.myServiceAppointments}>
                    <Button variant="outline" className="gap-1.5">
                      <CalendarClock className="h-4 w-4" /> المواعيد
                    </Button>
                  </Link>
                </>
              )}
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((listing) => {
            const thumb = listing.images[0]
              ? getThumbnailUrl(listing.images[0], 120, 90)
              : PLACEHOLDER_SVG;
            return (
              <div key={listing.id} className="flex gap-3 p-3 rounded-lg border bg-card">
                {listing.status !== 'DELETED' && (
                  <input
                    type="checkbox"
                    className="mt-1 shrink-0"
                    checked={selected.has(listing.id)}
                    onChange={() => toggleSelect(listing.id)}
                    aria-label={`تحديد ${listing.title}`}
                  />
                )}
                <div className="relative w-24 h-18 shrink-0 rounded overflow-hidden bg-muted">
                  <SafeImage src={thumb} alt={listing.title} fill className="object-cover" sizes="96px" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={ROUTES.serviceDetail(listing.id)}
                      className="font-medium text-sm hover:underline line-clamp-1"
                    >
                      {listing.title}
                    </Link>
                    <Badge
                      variant={
                        listing.status === 'ACTIVE'
                          ? 'default'
                          : listing.status === 'PAUSED'
                            ? 'secondary'
                            : 'destructive'
                      }
                      className="shrink-0 text-xs"
                    >
                      {STATUS_LABELS[listing.status]}
                    </Badge>
                  </div>
                  <p className="text-primary font-bold text-sm">
                    {formatServicePrice(listing.pricingType, listing.price)}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {listing.views}
                    </span>
                    <span>{formatRelativeTime(listing.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {listing.status === 'ACTIVE' && listing.price != null && (
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-success" aria-label={`بيع ${listing.title}`} title="بعت" onClick={() => setSalePrefill({ entityType: 'SERVICE', entityId: listing.id, entityTitle: listing.title, entityImageUrl: listing.images?.[0] ?? null, unitPrice: Number(listing.price) })}>
                      <Briefcase className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Link href={ROUTES.myServiceEdit(listing.id)}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      aria-label={`تعديل ${listing.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  {listing.status !== 'DELETED' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      aria-label={
                        listing.status === 'PAUSED'
                          ? `إعادة تفعيل ${listing.title}`
                          : `إيقاف ${listing.title} مؤقتاً`
                      }
                      title={listing.status === 'PAUSED' ? 'إعادة تفعيل' : 'إيقاف مؤقت'}
                      // FIX BULK-RACE: previously this disabled the
                      // button only for the id currently mutating,
                      // which allowed clicking a different row's
                      // toggle while a bulk loop was in flight — two
                      // overlapping mutations on the same useMutation
                      // instance, whose shared isPending/variables
                      // state cannot represent both. Disable all
                      // toggles whenever any toggle is pending; the
                      // whole point of a bulk action is that the user
                      // waits for it before doing anything else.
                      disabled={toggleStatus.isPending}
                      onClick={() =>
                        toggleStatus.mutate({
                          id: listing.id,
                          status: listing.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED',
                        })
                      }
                    >
                      {listing.status === 'PAUSED' ? (
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
                    aria-label={`حذف ${listing.title}`}
                    onClick={() => setDeleteTargetId(listing.id)}
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
          baseUrl={ROUTES.myServices}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
        title="حذف الخدمة؟"
        description="لا يمكن التراجع عن هذا الإجراء بعد التأكيد."
        confirmLabel="حذف"
        destructive
        isPending={deleteListing.isPending}
        onConfirm={() => {
          if (!deleteTargetId) return;
          deleteListing.mutate(deleteTargetId, { onSuccess: () => setDeleteTargetId(null) });
        }}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`حذف ${selected.size} خدمة؟`}
        description="لا يمكن التراجع عن هذا الإجراء بعد التأكيد."
        confirmLabel="حذف المحدد"
        destructive
        isPending={bulkBusy === 'delete'}
        onConfirm={() => void performBulkDelete()}
      />
    <AddSaleDialog open={Boolean(salePrefill)} onOpenChange={(open) => { if (!open) setSalePrefill(null); }} prefill={salePrefill} />
    </div>
  );
}
