'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';

import { useState } from 'react';
import Link from 'next/link';
import { Flag } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyReports } from '@/hooks/queries/useMyReports';
import { REPORT_STATUS_LABELS, ROUTES } from '@/lib/constants';
import type { Report, ReportTargetType } from '@/types/admin.types';

// FEAT-REPORT-USER-STORE: same three target kinds AdminReportsTable
// renders, but from the reporter's own point of view — what did I
// report, and what happened to it.
const TARGET_TYPE_LABELS: Record<ReportTargetType, string> = {
  AD: 'إعلان',
  USER: 'مستخدم',
  STORE: 'متجر',
  PRODUCT: 'منتج',
  SERVICE_LISTING: 'خدمة',
};

function targetHref(targetType: ReportTargetType, targetId: string): string {
  if (targetType === 'USER') return ROUTES.userProfile(targetId);
  if (targetType === 'STORE') return ROUTES.storeDetail(targetId);
  if (targetType === 'PRODUCT') return ROUTES.productDetail(targetId);
  if (targetType === 'SERVICE_LISTING') return ROUTES.serviceDetail(targetId);
  return ROUTES.adDetail(targetId);
}


function MyReportRow({ report }: { report: Report }) {
  const statusLabel = REPORT_STATUS_LABELS[report.status] ?? report.status;
  const isPending = report.status === 'PENDING';
  const title =
    report.ad?.title ||
    (report.targetType === 'USER' ? 'مستخدم' : TARGET_TYPE_LABELS[report.targetType]);

  return (
    <article className="rounded-[14px] border border-[#EAE3D6] bg-card p-3.5 shadow-[0_1px_3px_rgba(42,36,29,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex h-[22px] items-center rounded-full bg-[#F0EADF] px-2 text-[11px] font-bold text-[#4A433A]">
          {TARGET_TYPE_LABELS[report.targetType]}
        </span>
        <span
          className={
            isPending
              ? 'inline-flex h-[22px] items-center rounded-full bg-[#FBF0D9] px-2 text-[11px] font-bold text-[#7A4B07]'
              : 'inline-flex h-[22px] items-center rounded-full bg-[#E8F1EC] px-2 text-[11px] font-bold text-[#1F4D33]'
          }
        >
          {statusLabel}
        </span>
      </div>
      <Link
        href={targetHref(report.targetType, report.targetId)}
        className="mt-2 block text-[15px] font-extrabold text-foreground hover:underline"
      >
        {title}
      </Link>
      <p className="mt-1 text-[12px] text-[#6B6459]">
        <HydrationSafeRelativeTime date={report.createdAt} />
      </p>
    </article>
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
      <div className="rounded-[14px] border border-[#F1C9C4] bg-card px-4 py-4 text-center">
        <p className="text-[14px] font-bold text-[#9B2118]">حدث خطأ أثناء تحميل بلاغاتك</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-[#CFE0D5] bg-white px-3 text-[13px] font-bold text-[#1F4D33]"
        >
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
            صفحة {page} من {data!.meta.totalPages}
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
