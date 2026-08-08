'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button }       from '@/components/shared/ui/Button';
import { Badge }        from '@/components/shared/ui/Badge';
import { Pagination }   from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useAdminReports }   from '@/hooks/queries/useAdmin';
import { useAdminUpdateReportStatus } from '@/hooks/mutations/useAdminMutations';
import { REPORT_REASON_LABELS, ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
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

  const { data, isLoading, isError, refetch } = useAdminReports({ page, status, targetType });
  const resolveReport = useAdminUpdateReportStatus();

  // UX-FIX (same pattern as AdminUsersTable's FIX UX-11): resolveReport's
  // isPending is shared across every row (one mutation instance), so
  // without tracking which specific report id is in flight, a click on
  // one row's "حل"/"رفض" left every other row's buttons live too — an
  // admin could double-click, or fire two different rows' mutations
  // concurrently, with no visual feedback that anything was in progress.
  const pendingReportId = resolveReport.isPending ? resolveReport.variables?.reportId : undefined;

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

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

      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : isError ? (
        // UX-FIX P1-9 (admin variant): must not render as "لا توجد
        // بلاغات" on a failed fetch — an admin could wrongly conclude
        // the queue is genuinely empty and stop checking it.
        <div className="flex flex-col items-center gap-3 py-12 text-center rounded-lg border">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <p className="text-destructive">حدث خطأ أثناء تحميل البلاغات</p>
          <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
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
                          onClick={() => resolveReport.mutate({ reportId: report.id, status: 'RESOLVED' })}>
                          <CheckCircle className="h-3.5 w-3.5 me-1" />حل
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-muted-foreground"
                          disabled={pendingReportId === report.id}
                          onClick={() => resolveReport.mutate({ reportId: report.id, status: 'DISMISSED' })}>
                          رفض
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">لا توجد بلاغات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          baseUrl="/admin/reports" searchParams={Object.fromEntries(sp.entries())} />
      )}
    </div>
  );
}
