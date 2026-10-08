'use client';

import { memo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { Pagination } from '@/components/shared/ui/Pagination';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ApiError } from '@/components/shared/ApiError';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { useAdminOpenRequests } from '@/hooks/queries/useAdmin';
import { useAdminCancelOpenRequest } from '@/hooks/mutations/useAdminMutations';
import { toast } from 'sonner';
import { parseApiError } from '@/lib/errorParser';
import type { RequestStatus, RequestType } from '@/types/request.types';
import { adminPagination } from '@/lib/adminHubTabs';
import { AdminOpenRequestRow } from './AdminOpenRequestRow';

type RequestRow = {
  id: string;
  type: RequestType;
  title: string;
  description?: string;
  city?: string | null;
  status: RequestStatus;
  createdAt: string;
  customer?: { id: string; name: string } | null;
  _count?: { offers?: number };
};

export const AdminOpenRequestsTable = memo(function AdminOpenRequestsTable() {
  const sp = useSearchParams();
  // clamp URL page param to positive integer.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const q = sp.get('q') ?? '';
  const statusParam = sp.get('status') ?? 'OPEN';
  const status = ['OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED', 'ALL'].includes(statusParam)
    ? statusParam
    : 'OPEN';
  const typeParam = sp.get('type') ?? 'ALL';
  const type =
    typeParam === 'SERVICE' || typeParam === 'PRODUCT' || typeParam === 'RENTAL'
      ? typeParam
      : undefined;

  const { data, isLoading, isError, error, refetch } = useAdminOpenRequests({
    page,
    limit: 20,
    q: q || undefined,
    status: status === 'ALL' ? undefined : status,
    type,
  });
  const cancelMut = useAdminCancelOpenRequest();
  const [cancelId, setCancelId] = useState<string | null>(null);

  const items = (Array.isArray(data?.data) ? data.data : []) as RequestRow[];
  const totalPages =
    (data as { meta?: { pagination?: { totalPages?: number } } })?.meta?.pagination?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <AdminFilterBar
        searchPlaceholder="بحث في العنوان أو الوصف أو المدينة…"
        defaultTab="OPEN"
        tabs={[
          { value: 'OPEN', label: 'مفتوح' },
          { value: 'ACCEPTED', label: 'مقبول' },
          { value: 'CANCELLED', label: 'ملغى' },
          { value: 'EXPIRED', label: 'منتهي' },
          { value: 'ALL', label: 'الكل' },
        ]}
      />

      {/* FIX OPEN-REQ-POLISH-01: rows={8} was the default anyway; columns={5}
          mismatched this table's actual six columns. */}
      {isLoading && <TableSkeleton columns={6} />}
      {/* FIX OPEN-REQ-POLISH-01 (part 2): same treatment every other
          admin table already has -- ApiError differentiates 401/403/
          404/500+ with consistent icons. */}
      {isError && (
        <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />
      )}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState icon={<ClipboardList className="h-10 w-10" />} title="لا طلبات" description="لا نتائج للفلتر الحالي" />
      )}

      {!isLoading && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-start">
              <tr>
                <th className="p-3 font-medium">الطلب</th>
                <th className="p-3 font-medium">النوع</th>
                <th className="p-3 font-medium">الحالة</th>
                <th className="p-3 font-medium">العروض</th>
                <th className="p-3 font-medium">متى</th>
                <th className="p-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <AdminOpenRequestRow key={r.id} row={r} onCancel={setCancelId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FIX OPEN-REQ-POLISH-01 (part 3): {totalPages > 1 && ...} gate */}
      {Number(totalPages) > 1 && (
      <Pagination
        totalPages={Number(totalPages) || 1}
        currentPage={page}
        {...adminPagination('open-requests', {
          q: q || undefined,
          status: status !== 'OPEN' ? status : undefined,
          type: type,
        })}
      />
      )}

      <ConfirmDialog
        open={Boolean(cancelId)}
        onOpenChange={(o) => !o && setCancelId(null)}
        title="إلغاء الطلب؟"
        description="سيتم إلغاء الطلب المفتوح ولن يستقبل عروضًا جديدة."
        confirmLabel="إلغاء الطلب"
        onConfirm={() => {
          if (!cancelId) return;
          cancelMut.mutate(
            { id: cancelId },
            {
              onSuccess: () => {
                toast.success('تم إلغاء الطلب');
                setCancelId(null);
              },
              onError: () => toast.error('تعذّر الإلغاء'),
            },
          );
        }}
      />
    </div>
  );
});
