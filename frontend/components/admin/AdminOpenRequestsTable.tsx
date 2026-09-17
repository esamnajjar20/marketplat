'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClipboardList, Ban } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Pagination } from '@/components/shared/ui/Pagination';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { useAdminOpenRequests } from '@/hooks/queries/useAdmin';
import { useAdminCancelOpenRequest } from '@/hooks/mutations/useAdminMutations';
import { formatRelativeTime } from '@/lib/formatters';
import { toast } from 'sonner';
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import type { RequestStatus, RequestType } from '@/types/request.types';

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

export function AdminOpenRequestsTable() {
  const sp = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
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

  const { data, isLoading, isError, refetch } = useAdminOpenRequests({
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

      {isLoading && <TableSkeleton rows={8} columns={5} />}
      {isError && (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="تعذّر التحميل"
          description="حاول مرة أخرى"
          action={<Button onClick={() => refetch()}>إعادة المحاولة</Button>}
        />
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
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.customer?.name ?? '—'}
                      {r.city ? ` · ${r.city}` : ''}
                    </div>
                  </td>
                  <td className="p-3">{REQUEST_TYPE_LABEL[r.type] ?? r.type}</td>
                  <td className="p-3">
                    <Badge variant={r.status === 'OPEN' ? 'default' : 'secondary'}>
                      {REQUEST_STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </td>
                  <td className="p-3">{r._count?.offers ?? 0}</td>
                  <td className="p-3 text-muted-foreground">{formatRelativeTime(r.createdAt)}</td>
                  <td className="p-3">
                    {r.status === 'OPEN' && (
                      <Button size="sm" variant="outline" onClick={() => setCancelId(r.id)}>
                        <Ban className="me-1 h-3.5 w-3.5" />
                        إلغاء
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        totalPages={Number(totalPages) || 1}
        currentPage={page}
        baseUrl="/admin/open-requests"
        searchParams={{
          q: q || undefined,
          status: status !== 'OPEN' ? status : undefined,
          type: type,
        }}
      />

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
}
