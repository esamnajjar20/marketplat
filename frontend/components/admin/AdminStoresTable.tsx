'use client';

// FIX BULK-BTN-DISABLED-01: same treatment as AdminAdsTable/AdminSellersTable
// -- the bulk action buttons had no disabled state during isPending, so
// a double-click could fire the same batch twice.

/**
 * AdminStoresTable — audit report issue #1 (🔴 critical).
 *
 * The report's finding: POST /stores creates a store in PENDING status
 * and requires admin approval to go live (see stores.service.ts's
 * updateStoreStatus, which existed fully server-side), but GET /stores
 * (public) is hardcoded to `status: 'ACTIVE'` — so there was no
 * endpoint, let alone UI, that could ever list a PENDING store. Every
 * new store stayed PENDING forever. GET /admin/stores now exists
 * (admin.routes.ts + stores.repository.ts's findManyForAdmin) and this
 * table is the missing approval UI.
 *
 * Mirrors AdminSellersTable.tsx's structure: search input, status
 * filter tabs (the equivalent of sellers' verified/suspended toggle,
 * but for the 3-state PENDING/ACTIVE/BLOCKED status), table, per-row
 * action buttons, pagination. A block action gets a ConfirmDialog since
 * it hides a live store from the public directory; approving a PENDING
 * store and un-blocking are both a single click, same asymmetry as
 * AdminSellersTable's verify vs. suspend.
 */

import { memo, useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Ban, RotateCcw, Search, Star } from 'lucide-react';
import { Button }        from '@/components/shared/ui/Button';
import { Badge }         from '@/components/shared/ui/Badge';
import { Input }         from '@/components/shared/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { Checkbox }      from '@/components/shared/ui/Checkbox';
import { Pagination }    from '@/components/shared/ui/Pagination';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { ApiError } from '@/components/shared/ApiError';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { BulkActionBar } from '@/components/shared/admin/BulkActionBar';
import { useAdminStores, useAdminStoreTypes } from '@/hooks/queries/useAdmin';
import { AdminStoreRow } from '@/components/admin/AdminStoreRow';
import { useAdminUpdateStoreStatus, useAdminUpdateStorePlan, useAdminUpdateStoreType, useAdminBulkUpdateStoreStatus } from '@/hooks/mutations/useAdminMutations';
import { parseApiError } from '@/lib/errorParser';
import { cn } from '@/lib/utils';
import { STORE_STATUS_LABELS, STORE_STATUS_VARIANT } from '@/lib/storeStatus';
import type { AdminStoreStatus } from '@/types/admin.types';
import { adminListHref, adminPagination } from '@/lib/adminHubTabs';

const STATUS_TABS: { value: AdminStoreStatus | 'ALL'; label: string }[] = [
  { value: 'PENDING', label: 'قيد المراجعة' },
  { value: 'ACTIVE',  label: 'نشطة' },
  { value: 'BLOCKED', label: 'محظورة' },
  { value: 'ALL',     label: 'الكل' },
];

// FIX SEC-3.9: `statusParam` comes straight out of URLSearchParams —
// any string a user can type into the address bar, not something the
// type system already constrains. The previous `as AdminStoreStatus`
// cast asserted that without checking it, so an arbitrary/stale/typo'd
// `?status=` value would silently masquerade as a valid status instead
// of falling back to the safe PENDING default below. This is a real
// runtime check.
const VALID_STORE_STATUSES = new Set<AdminStoreStatus>(['PENDING', 'ACTIVE', 'BLOCKED']);
function isAdminStoreStatus(value: string | null): value is AdminStoreStatus {
  return !!value && VALID_STORE_STATUSES.has(value as AdminStoreStatus);
}

// FIX UX-13: was a locally hand-rolled STATUS_BADGE map — see
// lib/storeStatus.ts for why this is now the shared source of truth
// (MyStoreCard used a coincidentally-identical local copy).

export const AdminStoresTable = memo(function AdminStoresTable() {
  const sp     = useSearchParams();
  const router = useRouter();
  // SW-ADMIN-PAGE-NAN-01: a hand-edited URL like ?page=abc
  // gave NaN here, which was sent to the backend as
  // ?page=NaN — a guaranteed 400 for what looks like a
  // valid URL. Clamp to a positive integer, fallback 1.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const q      = sp.get('q') ?? '';
  // Defaults to PENDING — that's the queue an admin opens this page to
  // clear; without a default, the first paint would show newest-first
  // across all statuses and bury the stores actually needing action.
  const statusParam = sp.get('status');
  const status: AdminStoreStatus | 'ALL' = statusParam === 'ALL'
    ? 'ALL'
    : isAdminStoreStatus(statusParam) ? statusParam : 'PENDING';
  // Feature filter — reads ?featureRequested=1 from URL, forwarded to
  // the backend so admins can focus on stores asking for FEATURED plan.
  const featureRequested = sp.get('featureRequested') === '1';

  const { data, isLoading, isError, error, refetch } = useAdminStores({
    page,
    q: q || undefined,
    status: status === 'ALL' ? undefined : status,
    featureRequested: featureRequested || undefined,
  });
  const updateStatus = useAdminUpdateStoreStatus();
  const updatePlan = useAdminUpdateStorePlan();
  const updateType = useAdminUpdateStoreType();
  const { data: storeTypes = [] } = useAdminStoreTypes();
  const bulkUpdateStatus = useAdminBulkUpdateStoreStatus();

  const pendingId = updateStatus.isPending
    ? updateStatus.variables?.storeId
    : updatePlan.isPending ? updatePlan.variables?.storeId : undefined;

  // Blocking hides an already-live store from the public directory and
  // from its followers — consequential enough to confirm, same
  // reasoning as AdminSellersTable's suspend action. Approving a
  // PENDING store and un-blocking a BLOCKED one are both single-click.
  const [blockTarget, setBlockTarget] = useState<{ id: string; name: string } | null>(null);

  const items      = useMemo(() => data?.items ?? [], [data?.items]);
  const totalPages = data?.meta?.totalPages ?? 1;

  // BULK-ADMIN (item 17): the realistic bulk workflow is clearing the
  // PENDING queue (approve many at once) — every row is selectable
  // regardless of its current status (mirrors AdminSellersTable), but
  // the bulk bar's actions are still meaningful whatever status a
  // selected row happens to be in: "bulk approve" sets ACTIVE on
  // whichever selected rows aren't already ACTIVE, "bulk block" sets
  // BLOCKED. A selected row already in the target status is simply a
  // no-op update on the backend (findById succeeds, update sets the
  // same value) — not worth filtering out client-side for the
  // marginal case of a mixed-status selection.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBlockConfirmOpen, setBulkBlockConfirmOpen] = useState(false);

  const allSelected = items.length > 0 && items.every((s) => selectedIds.has(s.id));

  // SW-FIX-STORES-SELECT-DEPS: `featureRequested` was missing — toggling
  // the feature-requests filter left stale selections on screen.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, q, status, featureRequested]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((s) => s.id)));
  }

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value); else params.delete(key);
    }
    params.delete('page');
    router.replace(adminListHref('stores', params));
  }

  const updateStatusForRow = useCallback((storeId: string, status: AdminStoreStatus) => {
    updateStatus.mutate({ storeId, status });
  }, [updateStatus]);
  const updatePlanForRow = useCallback((storeId: string, plan: 'FREE' | 'FEATURED') => {
    updatePlan.mutate({ storeId, plan });
  }, [updatePlan]);
  const updateTypeForRow = useCallback((storeId: string, storeTypeId: string) => {
    updateType.mutate({ storeId, storeTypeId });
  }, [updateType]);
  const setBlockTargetForRow = useCallback((id: string, name: string) => {
    setBlockTarget({ id, name });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={featureRequested ? 'default' : 'outline'}
          onClick={() => updateParams({ featureRequested: featureRequested ? undefined : '1' })}
          className="gap-1"
        >
          <Star className="h-3.5 w-3.5" aria-hidden />
          طلبات التمييز
        </Button>
        {STATUS_TABS.map((tab) => {
          const isActive = tab.value === status;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => updateParams({ status: tab.value })}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-input hover:bg-muted',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* FIX BUG-XX: see AdminUsersTable — key={q} forces a remount when
          `q` changes via browser back/forward, so the uncontrolled
          defaultValue doesn't go stale relative to the URL/results. */}
      <Input key={q} placeholder="بحث باسم المتجر…" aria-label="بحث باسم المتجر" defaultValue={q}
        onBlur={(e) => updateParams({ q: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter') updateParams({ q: (e.target as HTMLInputElement).value }); }}
        className="max-w-xs" />

      <BulkActionBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button variant="outline" size="sm" className="h-7 text-success"
          disabled={bulkUpdateStatus.isPending}
          onClick={() => bulkUpdateStatus.mutate(
            { storeIds: Array.from(selectedIds), status: 'ACTIVE' },
            { onSuccess: () => setSelectedIds(new Set()) },
          )}>
          <CheckCircle2 className="h-3.5 w-3.5 me-1" />الموافقة على المحدد
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-destructive"
          disabled={bulkUpdateStatus.isPending}
          onClick={() => setBulkBlockConfirmOpen(true)}>
          <Ban className="h-3.5 w-3.5 me-1" />حظر المحدد
        </Button>
      </BulkActionBar>

      {isLoading ? (
        // FIX AUDIT-1: TableSkeleton instead of a centered LoadingSpinner
        // on refetch — see AdminAdsTable for the full rationale.
        <TableSkeleton columns={7} />
      ) : isError ? (
        // Same UX-FIX P1-9 reasoning as AdminSellersTable: a failed
        // fetch must not render as "لا توجد متاجر" — that would wrongly
        // read as "there are genuinely no pending stores."
        // FIX AUDIT-1: shared ApiError instead of a hand-rolled block —
        // see AdminAdsTable for the full rationale.
        <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />
      ) : (
        <>
        {/* Mobile cards */}
        <div className="space-y-2 md:hidden">
          {items.map((store) => {
            const wantsFeature = Boolean(store.featureRequestedAt);
            const badge = { label: STORE_STATUS_LABELS[store.status], variant: STORE_STATUS_VARIANT[store.status] };
            return (
              <div key={store.id} className="rounded-xl border border-border bg-card p-3 shadow-xs">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedIds.has(store.id)}
                    onChange={() => toggleOne(store.id)}
                    aria-label={`تحديد متجر ${store.name}`}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold leading-snug">{store.name}</p>
                    <p className="text-xs text-muted-foreground">{store.sellerProfile.displayName}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                      {wantsFeature && (
                        <Badge variant="outline" className="gap-1 text-2xs"><Star className="h-3 w-3" />طلب تمييز</Badge>
                      )}
                      {store.city && <span className="text-2xs-tight text-muted-foreground">{store.city}</span>}
                    </div>
                  </div>
                </div>
                {/* SW-FIX-MOBILE-STORES-ACTIONS: mobile parity with the
                    desktop table — same approve/block/feature actions,
                    same pendingId gating, same blockTarget ConfirmDialog.
                    An admin on a phone could only view the row before. */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">النوع</span>
                  <Select
                    value={store.storeTypeId}
                    onValueChange={(storeTypeId) => updateType.mutate({ storeId: store.id, storeTypeId })}
                    disabled={updateType.isPending}
                  >
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue placeholder="نوع المتجر" />
                    </SelectTrigger>
                    <SelectContent>
                      {storeTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.nameAr}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-1 border-t border-border/60 pt-2">
                  {store.status !== 'ACTIVE' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      aria-label={`الموافقة على متجر ${store.name}`}
                      disabled={pendingId === store.id}
                      onClick={() => updateStatus.mutate({ storeId: store.id, status: 'ACTIVE' })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      الموافقة
                    </Button>
                  )}
                  {store.status === 'BLOCKED' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      aria-label={`رفع الحظر عن متجر ${store.name}`}
                      disabled={pendingId === store.id}
                      onClick={() => updateStatus.mutate({ storeId: store.id, status: 'PENDING' })}
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-success" />
                      رفع الحظر
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-destructive hover:text-destructive"
                      aria-label={`حظر متجر ${store.name}`}
                      disabled={pendingId === store.id}
                      onClick={() => setBlockTarget({ id: store.id, name: store.name })}
                    >
                      <Ban className="h-3.5 w-3.5" />
                      حظر
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    aria-label={store.plan === 'FEATURED' ? `إلغاء تمييز متجر ${store.name}` : `تمييز متجر ${store.name}`}
                    disabled={pendingId === store.id}
                    onClick={() => updatePlan.mutate({
                      storeId: store.id,
                      plan: store.plan === 'FEATURED' ? 'FREE' : 'FEATURED',
                    })}
                  >
                    <Star className={`h-3.5 w-3.5 ${store.plan === 'FEATURED' ? 'fill-warning text-warning' : 'text-muted-foreground'}`} />
                    {store.plan === 'FEATURED' ? 'إلغاء التمييز' : 'تمييز'}
                  </Button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <EmptyState icon={<Search className="h-8 w-8" />} title="لا توجد متاجر" />
          )}
        </div>

        <div className="hidden w-full overflow-x-auto rounded-lg border md:block">
          <table className="w-full min-w-[640px] text-sm [&_th:last-child]:sticky [&_th:last-child]:end-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-muted/50 [&_td:last-child]:sticky [&_td:last-child]:end-0 [&_td:last-child]:z-10 [&_td:last-child]:bg-background [&_td:last-child]:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-10 p-3">
                  {items.length > 0 && (
                    <Checkbox checked={allSelected} onChange={toggleAll} aria-label="تحديد كل المتاجر" />
                  )}
                </th>
                <th className="text-start p-3 font-medium">المتجر</th>
                <th className="text-start p-3 font-medium hidden md:table-cell">البائع</th>
                <th className="text-start p-3 font-medium hidden sm:table-cell">المدينة</th>
                <th className="text-start p-3 font-medium hidden lg:table-cell">نوع المتجر</th>
                <th className="text-start p-3 font-medium">الحالة</th>
                <th className="text-start p-3 font-medium hidden lg:table-cell">تاريخ الإنشاء</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((store) => (
                <AdminStoreRow
                  key={store.id}
                  store={store}
                  selected={selectedIds.has(store.id)}
                  pendingId={pendingId}
                  pendingTypeId={updateType.isPending ? updateType.variables?.storeId : undefined}
                  storeTypes={storeTypes}
                  onToggle={toggleOne}
                  onUpdateStatus={updateStatusForRow}
                  onUpdatePlan={updatePlanForRow}
                  onUpdateType={updateTypeForRow}
                  onBlock={setBlockTargetForRow}
                />
              ))}
              {items.length === 0 && (
                <tr><td colSpan={8}><EmptyState icon={<Search className="h-8 w-8" />} title="لا توجد متاجر" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          {...adminPagination('stores', sp)} />
      )}

      <ConfirmDialog
        open={blockTarget !== null}
        onOpenChange={(open) => { if (!open) setBlockTarget(null); }}
        title="حظر هذا المتجر؟"
        description={`سيختفي متجر "${blockTarget?.name}" فورًا من الدليل العام ولن يتمكن متابعوه من رؤيته حتى يتم رفع الحظر.`}
        confirmLabel="حظر"
        destructive
        // SW-FIX-STORE-CONFIRM-PENDING: same granularity fix as the
        // sellers table.
        isPending={updateStatus.isPending && pendingId === blockTarget?.id}
        requireReason
        onConfirm={() => {}}
        onConfirmWithReason={(reason) => {
          if (!blockTarget) return;
          updateStatus.mutate(
            { storeId: blockTarget.id, status: 'BLOCKED', reason },
            { onSuccess: () => setBlockTarget(null) },
          );
        }}
      />

      {/* BULK-ADMIN (item 17): separate dialog/state from the
          single-row block above — same reasoning as the other tables'
          bulk ConfirmDialogs. */}
      <ConfirmDialog
        open={bulkBlockConfirmOpen}
        onOpenChange={setBulkBlockConfirmOpen}
        title={`حظر ${selectedIds.size} متجر؟`}
        description="ستختفي هذه المتاجر فورًا من الدليل العام ولن يتمكن متابعوها من رؤيتها حتى يتم رفع الحظر."
        confirmLabel="حظر"
        destructive
        isPending={bulkUpdateStatus.isPending}
        requireReason
        onConfirm={() => {}}
        onConfirmWithReason={(reason) => {
          bulkUpdateStatus.mutate(
            { storeIds: Array.from(selectedIds), status: 'BLOCKED', reason },
            {
              onSuccess: () => {
                setSelectedIds(new Set());
                setBulkBlockConfirmOpen(false);
              },
            },
          );
        }}
      />
    </div>
  );
});
