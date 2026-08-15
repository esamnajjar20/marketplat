'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, ExternalLink, Search } from 'lucide-react';
import { Button }       from '@/components/shared/ui/Button';
import { Badge }        from '@/components/shared/ui/Badge';
import { Checkbox }     from '@/components/shared/ui/Checkbox';
import { Pagination }   from '@/components/shared/ui/Pagination';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { ApiError } from '@/components/shared/ApiError';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { BulkActionBar } from '@/components/shared/admin/BulkActionBar';
import { useAdminReports }   from '@/hooks/queries/useAdmin';
import { useAdminUpdateReportStatus, useAdminBulkUpdateReportStatus } from '@/hooks/mutations/useAdminMutations';
import { REPORT_REASON_LABELS, ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import { parseApiError } from '@/lib/errorParser';
import type { ReportStatus, ReportTargetType } from '@/types/admin.types';

const REPORT_STATUSES = ['PENDING', 'RESOLVED', 'DISMISSED'] as const;

// FEAT-REPORT-USER-STORE: a report's target used to always be an ad, so
// this table only ever had to render one link shape. Now it renders
// whichever of the three target kinds the report actually points at —
// each maps to its own public route and label so the admin can open the
// right page instead of always landing on /ads/:id.
const TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
  AD: 'إعلان',
  USER: 'مستخدم',
  STORE: 'متجر',
};

function targetHref(targetType: ReportTargetType, targetId: string): string {
  if (targetType === 'USER') return ROUTES.userProfile(targetId);
  if (targetType === 'STORE') return ROUTES.storeDetail(targetId);
  return ROUTES.adDetail(targetId);
}

export function AdminReportsTable() {
  const sp     = useSearchParams();
  const router = useRouter();
  const page   = Number(sp.get('page') ?? 1);
  const statusParam = sp.get('status');
  const status: ReportStatus = REPORT_STATUSES.includes(statusParam as ReportStatus)
    ? (statusParam as ReportStatus)
    : 'PENDING';
  // FEAT-REPORT-USER-STORE: optional — 'all' (no param) shows every
  // target type mixed, same as before this feature existed.
  const targetTypeParam = sp.get('targetType');
  const targetType: ReportTargetType | undefined = (
    Object.keys(TARGET_TYPE_LABELS) as ReportTargetType[]
  ).includes(targetTypeParam as ReportTargetType)
    ? (targetTypeParam as ReportTargetType)
    : undefined;

  const { data, isLoading, isError, error, refetch } = useAdminReports({ page, status, targetType });
  const resolveReport = useAdminUpdateReportStatus();
  const bulkResolveReports = useAdminBulkUpdateReportStatus();

  // UX-FIX (same pattern as AdminUsersTable's FIX UX-11): resolveReport's
  // isPending is shared across every row (one mutation instance), so
  // without tracking which specific report id is in flight, a click on
  // one row's "حل"/"رفض" left every other row's buttons live too — an
  // admin could double-click, or fire two different rows' mutations
  // concurrently, with no visual feedback that anything was in progress.
  const pendingReportId = resolveReport.isPending ? resolveReport.variables?.reportId : undefined;

  // UX-FIX (audit P2-05): "حل"/"رفض" previously fired the mutation
  // directly on click — the one moderation-weight action in the app
  // with no confirmation, unlike role changes (AdminUsersTable), ad
  // deletion (AdminAdsTable), account deletion, and user blocking
  // (ChatWindow), which all gate through ConfirmDialog. A misclick
  // while triaging a report queue had no visible recovery. Same
  // controlled-target pattern as MyAdsList.tsx's deleteTargetId/
  // soldTargetId — tracks which report + which action the dialog
  // currently applies to (null = closed).
  const [confirmTarget, setConfirmTarget] = useState<{ reportId: string; status: 'RESOLVED' | 'DISMISSED' } | null>(null);

  // BULK-ADMIN (item 17): set of selected report ids on the current
  // page. Only PENDING reports can be selected in the first place (the
  // checkbox itself is only rendered for PENDING rows, same condition
  // as the existing resolve/دفض buttons below), so this never needs to
  // filter out already-resolved rows before submitting a batch.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Separate from confirmTarget (single-row) so the two confirm flows
  // stay independent — a bulk confirm in flight doesn't block a
  // single-row action on another page's data, and vice versa.
  const [bulkConfirmStatus, setBulkConfirmStatus] = useState<'RESOLVED' | 'DISMISSED' | null>(null);

  // FIX (lint: react-hooks/exhaustive-deps): `data?.items ?? []` was
  // producing a brand-new [] literal on every render whenever
  // data?.items was undefined, which made selectableIds' useMemo below
  // see a changed dependency on every render and recompute every time
  // regardless of whether the underlying data actually changed.
  // Memoizing items itself gives selectableIds a stable reference to
  // depend on.
  const items      = useMemo(() => data?.items ?? [], [data?.items]);
  const totalPages = data?.meta?.totalPages ?? 1;

  const selectableIds = useMemo(() => items.filter((r) => r.status === 'PENDING').map((r) => r.id), [items]);
  const allSelectableSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  // BULK-ADMIN (item 17): clear the selection whenever the visible set
  // of rows changes underneath it (page/status/targetType navigation).
  // Without this, selecting rows on page 1 then paging to page 2 left
  // the bulk bar showing "N محدد" for reports no longer on screen —
  // the ids were still correct (selection is id-based, not row-index-
  // based), but an admin acting on a bar they can't see the rows for
  // is exactly the confusing state this table's own filter-switch
  // logic elsewhere (e.g. clearing `page` on a status change) already
  // avoids for URL state, so selection should follow the same rule.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, status, targetType]);

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // FIX (lint: @typescript-eslint/no-unused-vars): this updater never
  // needed the previous Set — toggleAll's next value only depends on
  // allSelectableSelected/selectableIds from the enclosing closure, not
  // on the current selection — so the functional-update `prev` param
  // was dead. A plain setSelectedIds(...) is equivalent here since
  // there's no batched-update race this closure form was protecting
  // against (unlike toggleOne, which does depend on the previous set).
  function toggleAll() {
    setSelectedIds(allSelectableSelected ? new Set() : new Set(selectableIds));
  }

  function handleBulkConfirm() {
    if (!bulkConfirmStatus) return;
    bulkResolveReports.mutate(
      { reportIds: Array.from(selectedIds), status: bulkConfirmStatus },
      {
        onSuccess: () => {
          setSelectedIds(new Set());
          setBulkConfirmStatus(null);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      {/* Status filter */}
      <div className="flex gap-2" role="group" aria-label="تصفية البلاغات حسب الحالة">
        {([['PENDING', 'قيد المراجعة'], ['RESOLVED', 'محلولة'], ['DISMISSED', 'مرفوضة']] as const).map(([val, label]) => (
          <button key={val} onClick={() => {
            const params = new URLSearchParams(sp.toString());
            params.set('status', val); params.delete('page');
            router.push(`/admin/reports?${params.toString()}`);
          }}
            aria-pressed={status === val}
            className={`text-sm px-3 py-1 rounded-full transition-colors
              ${status === val ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* FEAT-REPORT-USER-STORE: target-type filter — separate control
          from status above since they're independent axes (any status ×
          any target type), and admins triaging one target type (e.g. all
          pending user reports) shouldn't have to page through ad reports
          mixed in. */}
      <div className="flex gap-2" role="group" aria-label="تصفية البلاغات حسب النوع">
        <button onClick={() => {
          const params = new URLSearchParams(sp.toString());
          params.delete('targetType'); params.delete('page');
          router.push(`/admin/reports?${params.toString()}`);
        }}
          aria-pressed={!targetType}
          className={`text-sm px-3 py-1 rounded-full transition-colors
            ${!targetType ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted text-muted-foreground'}`}>
          الكل
        </button>
        {(Object.entries(TARGET_TYPE_LABELS) as [ReportTargetType, string][]).map(([val, label]) => (
          <button key={val} onClick={() => {
            const params = new URLSearchParams(sp.toString());
            params.set('targetType', val); params.delete('page');
            router.push(`/admin/reports?${params.toString()}`);
          }}
            aria-pressed={targetType === val}
            className={`text-sm px-3 py-1 rounded-full transition-colors
              ${targetType === val ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted text-muted-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* BULK-ADMIN (item 17): only meaningful on the PENDING view, same
          as the per-row resolve/رفض buttons — resolved/dismissed reports
          have nothing left to batch-action. Mounted unconditionally;
          BulkActionBar itself renders null at selectedCount === 0. */}
      {status === 'PENDING' && (
        <BulkActionBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
          <Button variant="outline" size="sm" className="h-7 text-success"
            onClick={() => setBulkConfirmStatus('RESOLVED')}>
            <CheckCircle className="h-3.5 w-3.5 me-1" />حل المحدد
          </Button>
          <Button variant="outline" size="sm" className="h-7"
            onClick={() => setBulkConfirmStatus('DISMISSED')}>
            رفض المحدد
          </Button>
        </BulkActionBar>
      )}

      {isLoading ? (
        // FIX AUDIT-1: TableSkeleton instead of a centered LoadingSpinner
        // on refetch — see AdminAdsTable for the full rationale.
        <TableSkeleton columns={6} />
      ) : isError ? (
        // UX-FIX P1-9 (admin variant): must not render as "لا توجد
        // بلاغات" on a failed fetch — an admin could wrongly conclude
        // the queue is genuinely empty and stop checking it.
        // FIX AUDIT-1: shared ApiError instead of a hand-rolled block —
        // see AdminAdsTable for the full rationale.
        <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {/* BULK-ADMIN (item 17): select-all only when the current
                    view has at least one selectable (PENDING) row —
                    matches per-row checkbox visibility below. */}
                <th className="w-10 p-3">
                  {status === 'PENDING' && selectableIds.length > 0 && (
                    <Checkbox
                      checked={allSelectableSelected}
                      onChange={toggleAll}
                      aria-label="تحديد كل البلاغات"
                    />
                  )}
                </th>
                <th className="text-start p-3 font-medium">السبب</th>
                <th className="text-start p-3 font-medium hidden md:table-cell">الهدف</th>
                <th className="text-start p-3 font-medium hidden sm:table-cell">المُبلِّغ</th>
                <th className="text-start p-3 font-medium hidden lg:table-cell">التاريخ</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((report) => (
                <tr key={report.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    {report.status === 'PENDING' && (
                      <Checkbox
                        checked={selectedIds.has(report.id)}
                        onChange={() => toggleOne(report.id)}
                        aria-label={`تحديد البلاغ ${report.id}`}
                      />
                    )}
                  </td>
                  <td className="p-3">
                    <div className="space-y-0.5">
                      <Badge variant="outline" className="text-xs">
                        {REPORT_REASON_LABELS[report.reason] ?? report.reason}
                      </Badge>
                      {/* FIX TYPE-ERROR-01: was report.details, a field
                          that does not exist on Report
                          (types/admin.types.ts) — the actual field is
                          `notes`. Silently rendered nothing at runtime
                          (report.details was always undefined), so any
                          note an admin or user attached to a report was
                          never actually visible in this table. */}
                      {report.notes && <p className="text-xs text-muted-foreground line-clamp-2">{report.notes}</p>}
                    </div>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <Link href={targetHref(report.targetType, report.targetId)} target="_blank"
                      className="flex items-center gap-1 text-primary hover:underline text-xs">
                      <ExternalLink className="h-3 w-3" />
                      <span className="text-muted-foreground">[{TARGET_TYPE_LABELS[report.targetType]}]</span>
                      {report.ad?.title ? report.ad.title.slice(0, 40) : report.targetId.slice(-8)}
                    </Link>
                  </td>
                  {/* FIX TYPE-ERROR-01: was report.reporter, a field
                      that does not exist on Report — the actual field
                      is `user`. This always fell back to the '—'
                      placeholder at runtime, meaning the reporting
                      user's name was never actually shown to admins
                      reviewing reports. */}
                  <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">{report.user?.name ?? '—'}</td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatRelativeTime(report.createdAt)}</td>
                  <td className="p-3">
                    {report.status === 'PENDING' && (
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 text-success"
                          disabled={pendingReportId === report.id}
                          onClick={() => setConfirmTarget({ reportId: report.id, status: 'RESOLVED' })}>
                          <CheckCircle className="h-3.5 w-3.5 me-1" />حل
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-muted-foreground"
                          disabled={pendingReportId === report.id}
                          onClick={() => setConfirmTarget({ reportId: report.id, status: 'DISMISSED' })}>
                          رفض
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6}><EmptyState icon={<Search className="h-8 w-8" />} title="لا توجد بلاغات" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          baseUrl="/admin/reports" searchParams={Object.fromEntries(sp.entries())} />
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}
        title={confirmTarget?.status === 'RESOLVED' ? 'حل هذا البلاغ؟' : 'رفض هذا البلاغ؟'}
        description={
          confirmTarget?.status === 'RESOLVED'
            ? 'سيُعتبر هذا البلاغ محلولاً. يمكنك مراجعته لاحقاً من تبويب «محلولة».'
            : 'سيُعتبر هذا البلاغ مرفوضاً. يمكنك مراجعته لاحقاً من تبويب «مرفوضة».'
        }
        confirmLabel={confirmTarget?.status === 'RESOLVED' ? 'حل البلاغ' : 'رفض البلاغ'}
        isPending={resolveReport.isPending && resolveReport.variables?.reportId === confirmTarget?.reportId}
        onConfirm={() => {
          if (!confirmTarget) return;
          resolveReport.mutate(confirmTarget, { onSuccess: () => setConfirmTarget(null) });
        }}
      />

      {/* BULK-ADMIN (item 17): separate dialog instance from the
          single-row one above — same ConfirmDialog component, own
          controlled state, so a bulk action never collides with an
          in-flight single-row action. */}
      <ConfirmDialog
        open={bulkConfirmStatus !== null}
        onOpenChange={(open) => { if (!open) setBulkConfirmStatus(null); }}
        title={bulkConfirmStatus === 'RESOLVED' ? `حل ${selectedIds.size} بلاغ؟` : `رفض ${selectedIds.size} بلاغ؟`}
        description={
          bulkConfirmStatus === 'RESOLVED'
            ? 'سيتم اعتبار كل البلاغات المحددة محلولة.'
            : 'سيتم اعتبار كل البلاغات المحددة مرفوضة.'
        }
        confirmLabel={bulkConfirmStatus === 'RESOLVED' ? 'حل البلاغات' : 'رفض البلاغات'}
        isPending={bulkResolveReports.isPending}
        onConfirm={handleBulkConfirm}
      />
    </div>
  );
}
