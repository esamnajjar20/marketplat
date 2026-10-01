// FIX BULK-BTN-DISABLED-01: bulk action buttons in the admin tables
// had no disabled state during their mutation's isPending -- a
// double-click could fire the same batch twice.
'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { useSearchParams, useRouter } from 'next/navigation';
import { Star, Trash2, Pin, Search } from 'lucide-react';
import { Button }     from '@/components/shared/ui/Button';
import { Badge }      from '@/components/shared/ui/Badge';
import { Input }      from '@/components/shared/ui/Input';
import { Checkbox }   from '@/components/shared/ui/Checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { Pagination } from '@/components/shared/ui/Pagination';
import { Tooltip } from '@/components/shared/ui/Tooltip';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { ApiError }       from '@/components/shared/ApiError';
import { ConfirmDialog }  from '@/components/shared/feedback/ConfirmDialog';
import { EmptyState }     from '@/components/shared/feedback/EmptyState';
import { BulkActionBar }  from '@/components/shared/admin/BulkActionBar';
import { useAdminAds }    from '@/hooks/queries/useAdmin';
import {
  useAdminSetFeatured, useAdminSetPinned, useAdminForceDeleteAd,
  useAdminBulkSetFeatured, useAdminBulkSetPinned, useAdminBulkDeleteAds,
} from '@/hooks/mutations/useAdminMutations';
import { ROUTES, STATUS_LABELS } from '@/lib/constants';
import { AD_STATUS_VARIANT } from '@/lib/adStatus';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { parseApiError } from '@/lib/errorParser';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { adminListHref, adminPagination } from '@/lib/adminHubTabs';

export function AdminAdsTable() {
  const sp     = useSearchParams();
  const router = useRouter();
  // SW-ADMIN-PAGE-NAN-01: a hand-edited URL like ?page=abc
  // gave NaN here, which was sent to the backend as
  // ?page=NaN — a guaranteed 400 for what looks like a
  // valid URL. Clamp to a positive integer, fallback 1.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  // FIX BUG-02: same root cause as AdminUsersTable/AdminSellersTable —
  // sp.get() returns null when absent, and `?? ''` turned that into a
  // literal empty string that axios then serialised as a real
  // `?q=&status=` on the wire. adminGetAdsSchema's Zod validators
  // (q: z.string().min(1).optional(), status: z.nativeEnum(AdStatus)
  // .optional()) only accept a real value or a fully absent key —
  // '' satisfies neither, so every /admin/ads page load with no
  // active filters was rejected as a 400. q/status themselves stay ''
  // for the Input defaultValue and the `status || 'ALL'` Select value
  // below; only what's passed into the query hook is normalised.
  const q      = sp.get('q') ?? '';
  const status = sp.get('status') ?? '';

  const { data, isLoading, isError, error, refetch } = useAdminAds({ page, q: q || undefined, status: status || undefined });
  const featureAd = useAdminSetFeatured();
  const pinAd     = useAdminSetPinned();
  const deleteAd  = useAdminForceDeleteAd();
  const bulkFeatureAds = useAdminBulkSetFeatured();
  const bulkPinAds     = useAdminBulkSetPinned();
  const bulkDeleteAds  = useAdminBulkDeleteAds();

  // UX-FIX P1-5 / P2-11: featureAd/pinAd are each a single shared mutation
  // instance (see useToggleAdField), so isPending alone can't tell us
  // *which* row is in flight, and previously there was no disabled state
  // at all on these two buttons — a fast repeat click could fire the
  // toggle multiple times before the optimistic update even settled.
  // Track (adId, field) pairs currently in flight instead.
  const [pendingToggle, setPendingToggle] = useState<{ adId: string; field: 'featured' | 'pinned' } | null>(null);

  // Tracks which ad the delete-confirmation dialog applies to (null = closed).
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // BULK-ADMIN (item 17): selection is id-based, not row-index-based —
  // every row is selectable here (unlike AdminReportsTable, where only
  // PENDING rows are), since feature/pin/delete are all valid on an ad
  // in any status.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Which bulk action's confirm dialog is open, if any. Feature/pin are
  // reversible toggles (no confirm needed, same as their single-row
  // buttons above) — only delete needs one, matching the single-row
  // delete flow's own ConfirmDialog.
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  const items      = useMemo(() => data?.items ?? [], [data?.items]);
  const totalPages = data?.meta?.totalPages ?? 1;

  const allSelected = items.length > 0 && items.every((ad) => selectedIds.has(ad.id));

  // BULK-ADMIN (item 17): clear the selection whenever the visible row
  // set changes underneath it — same reasoning as AdminReportsTable's
  // identical effect.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, q, status]);

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((ad) => ad.id)));
  }

  function toggleFeatured(adId: string, next: boolean) {
    setPendingToggle({ adId, field: 'featured' });
    featureAd.mutate({ adId, value: next }, { onSettled: () => setPendingToggle(null) });
  }

  function togglePinned(adId: string, next: boolean) {
    setPendingToggle({ adId, field: 'pinned' });
    pinAd.mutate({ adId, value: next }, { onSettled: () => setPendingToggle(null) });
  }

  function search(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set('q', value); else params.delete('q');
    params.delete('page');
    router.replace(adminListHref('ads', params));
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3">
        {/* FIX BUG-XX: see AdminUsersTable — key={q} forces a remount when
            `q` changes via browser back/forward, so the uncontrolled
            defaultValue doesn't go stale relative to the URL/results. */}
        <Input key={q} placeholder="بحث بالعنوان…" aria-label="بحث بالعنوان" defaultValue={q}
          onBlur={(e) => search(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search((e.target as HTMLInputElement).value); }}
          className="max-w-xs" />
        {/* FIX UX-02: native <select> swapped for the app's Radix Select
            — matches the styled Input beside it instead of falling back
            to the browser's own control chrome. Radix disallows an item
            with value="", so "كل الحالات" uses an 'ALL' sentinel that's
            translated back to an absent `status` param on change. */}
        <Select
          value={status || 'ALL'}
          onValueChange={(value) => {
            const params = new URLSearchParams(sp.toString());
            if (value !== 'ALL') params.set('status', value); else params.delete('status');
            params.delete('page');
            router.replace(adminListHref('ads', params));
          }}
        >
          <SelectTrigger className="w-auto min-w-[10rem]">
            <SelectValue placeholder="كل الحالات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل الحالات</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* BULK-ADMIN (item 17): unconditional — every row here is
          selectable regardless of status, so unlike AdminReportsTable
          this doesn't need a status-view guard. */}
      <BulkActionBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button variant="outline" size="sm" className="h-7"
          disabled={bulkFeatureAds.isPending}
          onClick={() => bulkFeatureAds.mutate(
            { adIds: Array.from(selectedIds), isFeatured: true },
            { onSuccess: () => setSelectedIds(new Set()) },
          )}>
          <Star className="h-3.5 w-3.5 me-1" />تمييز المحدد
        </Button>
        <Button variant="outline" size="sm" className="h-7"
          disabled={bulkPinAds.isPending}
          onClick={() => bulkPinAds.mutate(
            { adIds: Array.from(selectedIds), isPinned: true },
            { onSuccess: () => setSelectedIds(new Set()) },
          )}>
          <Pin className="h-3.5 w-3.5 me-1" />تثبيت المحدد
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-destructive"
          onClick={() => setBulkDeleteConfirmOpen(true)}>
          <Trash2 className="h-3.5 w-3.5 me-1" />حذف المحدد
        </Button>
      </BulkActionBar>

      {isError ? (
        // UX-FIX P1-4: previously a failed fetch fell straight through to
        // the `items.length === 0` empty-state row below, indistinguishable
        // from "no ads exist" — an admin had no way to tell a real fetch
        // failure apart from a genuinely empty result set.
        // FIX AUDIT-1: swapped the hand-rolled error block for the shared
        // ApiError component (401/403/404/500+ handling, consistent
        // icons — see ApiError.tsx) instead of one generic message with
        // no icon and no status differentiation.
        <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />
      ) : isLoading ? (
        // FIX AUDIT-1: TableSkeleton instead of a centered LoadingSpinner
        // on refetch (filter/page/search change) — previously only the
        // *first* load (via loading.tsx) got the table-shaped skeleton;
        // every subsequent refetch collapsed to a spinner, losing the
        // table's shape and causing a layout jump each time.
        <TableSkeleton columns={7} />
      ) : (
        <>
        {/* Mobile card list — avoids cramped horizontal table on narrow screens */}
        <div className="space-y-2 md:hidden">
          {items.map((ad) => {
            const thumb = ad.images[0] ? getThumbnailUrl(ad.images[0], 80, 60) : PLACEHOLDER_SVG;
            return (
              <div key={ad.id} className="rounded-xl border border-border bg-card p-3 shadow-xs">
                <div className="flex gap-3">
                  <Checkbox
                    checked={selectedIds.has(ad.id)}
                    onChange={() => toggleOne(ad.id)}
                    aria-label={`تحديد ${ad.title}`}
                    className="mt-1"
                  />
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <SafeImage src={thumb} alt="" fill className="object-cover" sizes="56px" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-sm font-medium leading-snug">{ad.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-primary">{formatPrice(ad.price)}</span>
                      <Badge variant={AD_STATUS_VARIANT[ad.status]} className="text-[10px]">
                        {STATUS_LABELS[ad.status] ?? ad.status}
                      </Badge>
                    </div>
                  </div>
                </div>
                {/* SW-FIX-MOBILE-ADS-ACTIONS: mobile parity with the
                    desktop table — the same feature/pin/delete actions,
                    same pendingToggle gating, same deleteTargetId dialog.
                    Only "عرض" was here before, so an admin on a phone
                    couldn't act on the queue at all. */}
                <div className="mt-2 flex flex-wrap items-center justify-end gap-1 border-t border-border/60 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    aria-label={ad.isFeatured ? `إلغاء تمييز ${ad.title}` : `تمييز ${ad.title}`}
                    disabled={pendingToggle?.adId === ad.id && pendingToggle.field === 'featured'}
                    onClick={() => toggleFeatured(ad.id, !ad.isFeatured)}
                  >
                    <Star className={`h-3.5 w-3.5 ${ad.isFeatured ? 'fill-warning text-warning' : ''}`} />
                    {ad.isFeatured ? 'إلغاء تمييز' : 'تمييز'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    aria-label={ad.isPinned ? `إلغاء تثبيت ${ad.title}` : `تثبيت ${ad.title}`}
                    disabled={pendingToggle?.adId === ad.id && pendingToggle.field === 'pinned'}
                    onClick={() => togglePinned(ad.id, !ad.isPinned)}
                  >
                    <Pin className={`h-3.5 w-3.5 ${ad.isPinned ? 'text-primary' : ''}`} />
                    {ad.isPinned ? 'إلغاء تثبيت' : 'تثبيت'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                    aria-label={`حذف ${ad.title}`}
                    onClick={() => setDeleteTargetId(ad.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </Button>
                  <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                    <Link prefetch={false} href={ROUTES.adDetail(ad.id)}>عرض</Link>
                  </Button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <EmptyState icon={<Search className="h-8 w-8" />} title="لا توجد إعلانات" />
          )}
        </div>

        <div className="hidden w-full overflow-x-auto rounded-lg border md:block">
          <table className="w-full min-w-[640px] text-sm [&_th:last-child]:sticky [&_th:last-child]:end-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-muted/50 [&_td:last-child]:sticky [&_td:last-child]:end-0 [&_td:last-child]:z-10 [&_td:last-child]:bg-background [&_td:last-child]:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-10 p-3">
                  {items.length > 0 && (
                    <Checkbox checked={allSelected} onChange={toggleAll} aria-label="تحديد كل الإعلانات" />
                  )}
                </th>
                <th className="text-start p-3 font-medium">الإعلان</th>
                <th className="text-start p-3 font-medium hidden md:table-cell">البائع</th>
                <th className="text-start p-3 font-medium">السعر</th>
                <th className="text-start p-3 font-medium hidden sm:table-cell">الحالة</th>
                <th className="text-start p-3 font-medium hidden lg:table-cell">التاريخ</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((ad) => {
                const thumb = ad.images[0] ? getThumbnailUrl(ad.images[0], 80, 60) : PLACEHOLDER_SVG;
                return (
                  <tr key={ad.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <Checkbox
                        checked={selectedIds.has(ad.id)}
                        onChange={() => toggleOne(ad.id)}
                        aria-label={`تحديد ${ad.title}`}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="relative w-12 h-9 rounded overflow-hidden bg-muted shrink-0">
                          <SafeImage src={thumb} alt={ad.title} fill className="object-cover" sizes="48px" />
                        </div>
                        <div className="min-w-0">
                          <Link prefetch={false} href={ROUTES.adDetail(ad.id)} className="font-medium hover:underline line-clamp-1"
                            target="_blank" rel="noopener noreferrer">{ad.title}</Link>
                          {ad.isFeatured && <Badge variant="outline" className="text-xs border-warning text-warning">مميز</Badge>}
                          {ad.isPinned   && <Badge variant="outline" className="text-xs me-1">مثبّت</Badge>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">{ad.user?.name ?? '—'}</td>
                    <td className="p-3 font-semibold">{formatPrice(ad.price)}</td>
                    <td className="p-3 hidden sm:table-cell">
                      <Badge
                        variant={AD_STATUS_VARIANT[ad.status]}
                        className="text-xs"
                      >
                        {STATUS_LABELS[ad.status] ?? ad.status}
                      </Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatRelativeTime(ad.createdAt)}</td>
                    <td className="p-3">
                      {/* FIX A11Y-01: title alone isn't reliably
                          announced by screen readers / has no keyboard
                          equivalent — aria-label is the real accessible
                          name here, and reflects the actual action
                          (toggle on/off) rather than a static label. */}
                      {/* DESKTOP-AUDIT-01: title= → Tooltip, matching
                          AdminAuditLogsTable. Content now tracks the
                          actual toggle state (was static "تمييز"/"تثبيت"
                          regardless of ad.isFeatured/isPinned — aria-label
                          already had the correct dynamic text, the visual
                          hint just hadn't caught up to it). */}
                      <div className="flex gap-1 justify-end">
                        <Tooltip content={ad.isFeatured ? 'إلغاء تمييز' : 'تمييز'}>
                          <Button variant="ghost" size="icon" className="h-9 w-9"
                            aria-label={ad.isFeatured ? `إلغاء تمييز ${ad.title}` : `تمييز ${ad.title}`}
                            disabled={pendingToggle?.adId === ad.id && pendingToggle.field === 'featured'}
                            onClick={() => toggleFeatured(ad.id, !ad.isFeatured)}>
                            <Star className={`h-3.5 w-3.5 ${ad.isFeatured ? 'fill-warning text-warning' : ''}`} />
                          </Button>
                        </Tooltip>
                        <Tooltip content={ad.isPinned ? 'إلغاء تثبيت' : 'تثبيت'}>
                          <Button variant="ghost" size="icon" className="h-9 w-9"
                            aria-label={ad.isPinned ? `إلغاء تثبيت ${ad.title}` : `تثبيت ${ad.title}`}
                            disabled={pendingToggle?.adId === ad.id && pendingToggle.field === 'pinned'}
                            onClick={() => togglePinned(ad.id, !ad.isPinned)}>
                            <Pin className={`h-3.5 w-3.5 ${ad.isPinned ? 'text-primary' : ''}`} />
                          </Button>
                        </Tooltip>
                        <Tooltip content="حذف">
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive"
                            aria-label={`حذف ${ad.title}`}
                            onClick={() => setDeleteTargetId(ad.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={7}><EmptyState icon={<Search className="h-8 w-8" />} title="لا توجد إعلانات" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          {...adminPagination('ads', sp)} />
      )}

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="حذف هذا الإعلان نهائياً؟"
        description="لا يمكن التراجع عن هذا الإجراء بعد التأكيد."
        confirmLabel="حذف"
        destructive
        isPending={deleteAd.isPending}
        onConfirm={() => {
          if (!deleteTargetId) return;
          deleteAd.mutate(deleteTargetId, { onSuccess: () => setDeleteTargetId(null) });
        }}
      />

      {/* BULK-ADMIN (item 17): separate dialog/state from the
          single-row delete above — same reasoning as
          AdminReportsTable's bulk ConfirmDialog. */}
      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
        title={`حذف ${selectedIds.size} إعلان نهائياً؟`}
        description="لا يمكن التراجع عن هذا الإجراء بعد التأكيد."
        confirmLabel="حذف"
        destructive
        isPending={bulkDeleteAds.isPending}
        onConfirm={() => {
          bulkDeleteAds.mutate(Array.from(selectedIds), {
            onSuccess: () => {
              setSelectedIds(new Set());
              setBulkDeleteConfirmOpen(false);
            },
          });
        }}
      />
    </div>
  );
}
