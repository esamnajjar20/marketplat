'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, ExternalLink } from 'lucide-react';
import { Button }       from '@/components/shared/ui/Button';
import { Badge }        from '@/components/shared/ui/Badge';
import { Pagination }   from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useAdminReports }   from '@/hooks/queries/useAdmin';
import { useAdminUpdateReportStatus } from '@/hooks/mutations/useAdminMutations';
import { REPORT_REASON_LABELS, ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import type { ReportStatus } from '@/types/admin.types';

const REPORT_STATUSES = ['PENDING', 'RESOLVED', 'DISMISSED'] as const;

export function AdminReportsTable() {
  const sp     = useSearchParams();
  const router = useRouter();
  const page   = Number(sp.get('page') ?? 1);
  const statusParam = sp.get('status');
  const status: ReportStatus = REPORT_STATUSES.includes(statusParam as ReportStatus)
    ? (statusParam as ReportStatus)
    : 'PENDING';

  const { data, isLoading }  = useAdminReports({ page, status });
  const resolveReport = useAdminUpdateReportStatus();

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

      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-start p-3 font-medium">السبب</th>
                <th className="text-start p-3 font-medium hidden md:table-cell">الإعلان</th>
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
                    <Link href={ROUTES.adDetail(report.adId)} target="_blank"
                      className="flex items-center gap-1 text-primary hover:underline text-xs">
                      <ExternalLink className="h-3 w-3" />
                      {report.ad?.title ? report.ad.title.slice(0, 40) : report.adId.slice(-8)}
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
                          onClick={() => resolveReport.mutate({ reportId: report.id, status: 'RESOLVED' })}>
                          <CheckCircle className="h-3.5 w-3.5 me-1" />حل
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-muted-foreground"
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
