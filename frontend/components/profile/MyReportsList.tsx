'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Flag, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyReports } from '@/hooks/queries/useMyReports';
import { formatRelativeTime } from '@/lib/formatters';
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS, ROUTES } from '@/lib/constants';
import type { Report, ReportTargetType, ReportStatus } from '@/types/admin.types';

// FEAT-REPORT-USER-STORE: same three target kinds AdminReportsTable
// renders, but from the reporter's own point of view — what did I
// report, and what happened to it.
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

// FEAT-REPORT-USER-STORE: color-codes the outcome so a reporter can
// scan the list without reading every status label — green once
// resolved, muted once dismissed, default (neutral) while still open.
// Badge only ships default | secondary | destructive | outline
// (components/ui/badge.tsx), so RESOLVED uses outline + the existing
// text-success token (same one AdminStoresTable/AdminUsersTable already
// use for a positive state) rather than inventing a variant that isn't there.
const STATUS_BADGE: Record<ReportStatus, { variant: 'default' | 'secondary' | 'outline'; className?: string }> = {
  PENDING: { variant: 'default' },
  RESOLVED: { variant: 'outline', className: 'text-success border-success' },
  DISMISSED: { variant: 'secondary' },
};

function MyReportRow({ report }: { report: Report }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Flag className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="shrink-0 text-xs">
              {REPORT_REASON_LABELS[report.reason] ?? report.reason}
            </Badge>
            <span className="text-xs text-muted-foreground shrink-0">
              [{TARGET_TYPE_LABELS[report.targetType]}]
            </span>
          </div>
          <Badge
            variant={STATUS_BADGE[report.status].variant}
            className={`shrink-0 font-normal ${STATUS_BADGE[report.status].className ?? ''}`}
          >
            {REPORT_STATUS_LABELS[report.status] ?? report.status}
          </Badge>
        </div>

        {report.notes && (
          <p className="text-sm text-muted-foreground line-clamp-2">{report.notes}</p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Link
            href={targetHref(report.targetType, report.targetId)}
            target="_blank"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {report.ad?.title ? report.ad.title.slice(0, 40) : 'عرض التفاصيل'}
          </Link>
          <p className="text-xs text-muted-foreground">{formatRelativeTime(report.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}

export function MyReportsList() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = useMyReports({ page });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل بلاغاتك</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if ((data?.items.length ?? 0) === 0) {
    return (
      <EmptyState
        icon={<Flag className="h-10 w-10" />}
        title="لا توجد بلاغات"
        description="البلاغات التي ترسلها عن إعلانات أو مستخدمين أو متاجر ستظهر هنا مع حالتها"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {data!.items.map((report) => (
          <MyReportRow key={report.id} report={report} />
        ))}
      </div>

      {data!.meta.totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2 py-4" aria-label="Pagination">
          {page <= 1 ? (
            <Button variant="outline" size="sm" disabled aria-disabled="true" className="pointer-events-none opacity-50">
              السابق
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={isFetching}>
              السابق
            </Button>
          )}
          <span className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
            {page} / {data!.meta.totalPages}
          </span>
          {page >= data!.meta.totalPages ? (
            <Button variant="outline" size="sm" disabled aria-disabled="true" className="pointer-events-none opacity-50">
              التالي
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={isFetching}>
              التالي
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
