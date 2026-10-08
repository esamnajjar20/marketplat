'use client';

import { memo } from 'react';
import Link from 'next/link';
import { CheckCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Checkbox } from '@/components/shared/ui/Checkbox';
import { ROUTES, REPORT_REASON_LABELS } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import type { Report, ReportStatus } from '@/types/admin.types';

const TARGET_TYPE_LABELS = {
  AD: 'إعلان',
  USER: 'مستخدم',
  STORE: 'متجر',
  PRODUCT: 'منتج',
  SERVICE_LISTING: 'خدمة',
} as const;

function targetHref(targetType: Report['targetType'], targetId: string): string {
  if (targetType === 'USER') return ROUTES.userProfile(targetId);
  if (targetType === 'STORE') return ROUTES.storeDetail(targetId);
  if (targetType === 'PRODUCT') return ROUTES.productDetail(targetId);
  if (targetType === 'SERVICE_LISTING') return ROUTES.serviceDetail(targetId);
  return ROUTES.adDetail(targetId);
}

type Props = {
  report: Report;
  selected: boolean;
  isPending: boolean;
  isLast?: boolean;
  onToggleSelected: (id: string) => void;
  onRequestStatus: (id: string, status: Extract<ReportStatus, 'RESOLVED' | 'DISMISSED'>) => void;
};

export const AdminReportRow = memo(function AdminReportRow({
  report,
  selected,
  isPending,
  onToggleSelected,
  onRequestStatus,
}: Props) {
  return (
    <tr className="hover:bg-muted/30 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_72px]">
      <td className="p-3">
        {report.status === 'PENDING' && (
          <Checkbox
            checked={selected}
            onChange={() => onToggleSelected(report.id)}
            aria-label={`تحديد البلاغ ${report.id}`}
          />
        )}
      </td>
      <td className="p-3">
        <div className="space-y-0.5">
          <Badge variant="outline" className="text-xs">
            {REPORT_REASON_LABELS[report.reason] ?? report.reason}
          </Badge>
          {report.notes && <p className="text-xs text-muted-foreground line-clamp-2">{report.notes}</p>}
        </div>
      </td>
      <td className="p-3 hidden md:table-cell">
        <Link
          prefetch={false}
          href={targetHref(report.targetType, report.targetId)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-primary hover:underline text-xs"
        >
          <ExternalLink className="h-3 w-3" />
          <span className="text-muted-foreground">[{TARGET_TYPE_LABELS[report.targetType]}]</span>
          {report.ad?.title ? report.ad.title.slice(0, 40) : report.targetId.slice(-8)}
        </Link>
      </td>
      <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">{report.user?.name ?? '—'}</td>
      <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatRelativeTime(report.createdAt)}</td>
      <td className="p-3">
        {report.status === 'PENDING' && (
          <div className="flex gap-1 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-success"
              disabled={isPending}
              onClick={() => onRequestStatus(report.id, 'RESOLVED')}
            >
              <CheckCircle className="h-3.5 w-3.5 me-1" />حل
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-muted-foreground"
              disabled={isPending}
              onClick={() => onRequestStatus(report.id, 'DISMISSED')}
            >
              رفض
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
});
