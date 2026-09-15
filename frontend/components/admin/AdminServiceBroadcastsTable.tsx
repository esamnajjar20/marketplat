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
import { useAdminServiceBroadcasts } from '@/hooks/queries/useAdmin';
import { useAdminCancelServiceBroadcast } from '@/hooks/mutations/useAdminMutations';
import { formatRelativeTime } from '@/lib/formatters';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'مفتوح',
  ACCEPTED: 'مقبول',
  CANCELLED: 'ملغى',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  OPEN: 'default',
  ACCEPTED: 'secondary',
  CANCELLED: 'destructive',
};

type BroadcastRow = {
  id: string;
  title: string;
  description?: string;
  city?: string | null;
  status: string;
  createdAt: string;
  customer?: { id: string; name: string } | null;
  category?: { id: string; name?: string; nameAr?: string | null } | null;
  _count?: { quotes?: number };
};

export function AdminServiceBroadcastsTable() {
  const sp = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const q = sp.get('q') ?? '';
  const statusParam = sp.get('status') ?? 'OPEN';
  const status = ['OPEN', 'ACCEPTED', 'CANCELLED', 'ALL'].includes(statusParam)
    ? statusParam
    : 'OPEN';

  const { data, isLoading, isError, refetch } = useAdminServiceBroadcasts({
    page,
    limit: 20,
    q: q || undefined,
    status: status === 'ALL' ? undefined : status,
  });
  const cancelMut = useAdminCancelServiceBroadcast();
  const [cancelTarget, setCancelTarget] = useState<{ id: string; title: string } | null>(null);

  const envelope = data as {
    data?: BroadcastRow[] | { items?: BroadcastRow[] };
    meta?: { pagination?: { totalPages?: number } };
  };
  const rows: BroadcastRow[] = Array.isArray(envelope?.data)
    ? envelope.data
    : (envelope?.data as { items?: BroadcastRow[] })?.items ?? [];
  const totalPages = envelope?.meta?.pagination?.totalPages ?? 1;

  if (isLoading) return <TableSkeleton rows={8} />;
  if (isError) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive">تعذّر تحميل طلبات الخدمة</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  function renderStatus(s: string) {
    return (
      <Badge variant={STATUS_VARIANT[s] ?? 'outline'}>
        {STATUS_LABELS[s] ?? s}
      </Badge>
    );
  }

  return (
    <div className="space-y-4">
      <AdminFilterBar
        searchPlaceholder="بحث في طلبات الخدمة…"
        tabParam="status"
        defaultTab="OPEN"
        tabs={[
          { value: 'OPEN', label: 'مفتوحة' },
          { value: 'ACCEPTED', label: 'مقبولة' },
          { value: 'CANCELLED', label: 'ملغاة' },
          { value: 'ALL', label: 'الكل' },
        ]}
      />

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {rows.length === 0 && (
          <EmptyState icon={<ClipboardList className="h-8 w-8" />} title="لا توجد طلبات" />
        )}
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-border bg-card p-3 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium line-clamp-2">{row.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {row.description}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {renderStatus(row.status)}
                  <span>{row.customer?.name ?? '—'}</span>
                  {row.city ? <span>· {row.city}</span> : null}
                  <span>· {formatRelativeTime(row.createdAt)}</span>
                  <span>· {(row._count?.quotes ?? 0)} عرض</span>
                </div>
                {row.category && (
                  <p className="text-[11px] text-muted-foreground">
                    {row.category.nameAr || row.category.name}
                  </p>
                )}
              </div>
              {row.status === 'OPEN' && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 text-destructive"
                  onClick={() => setCancelTarget({ id: row.id, title: row.title })}
                  aria-label="إلغاء الطلب"
                >
                  <Ban className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full min-w-[720px] text-sm [&_th:last-child]:sticky [&_th:last-child]:end-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-muted/50 [&_td:last-child]:sticky [&_td:last-child]:end-0 [&_td:last-child]:z-10 [&_td:last-child]:bg-background [&_td:last-child]:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
          <thead>
            <tr className="border-b bg-muted/50 text-start">
              <th className="p-3 font-medium">الطلب</th>
              <th className="p-3 font-medium">العميل</th>
              <th className="p-3 font-medium">الفئة</th>
              <th className="p-3 font-medium">العروض</th>
              <th className="p-3 font-medium">الحالة</th>
              <th className="p-3 font-medium">التاريخ</th>
              <th className="p-3 font-medium">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="p-3">
                  <p className="font-medium line-clamp-1 max-w-[220px]">{row.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1 max-w-[220px]">
                    {row.city ? `${row.city} · ` : ''}
                    {row.description}
                  </p>
                </td>
                <td className="p-3 whitespace-nowrap">{row.customer?.name ?? '—'}</td>
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {row.category?.nameAr || row.category?.name || '—'}
                </td>
                <td className="p-3 tabular-nums">{row._count?.quotes ?? 0}</td>
                <td className="p-3">{renderStatus(row.status)}</td>
                <td className="p-3 whitespace-nowrap text-muted-foreground">
                  {formatRelativeTime(row.createdAt)}
                </td>
                <td className="p-3">
                  {row.status === 'OPEN' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setCancelTarget({ id: row.id, title: row.title })}
                    >
                      <Ban className="h-4 w-4" />
                      <span className="ms-1">إلغاء</span>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <EmptyState icon={<ClipboardList className="h-8 w-8" />} title="لا توجد طلبات" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl="/admin/service-broadcasts"
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
        title="إلغاء طلب الخدمة؟"
        description={`سيتم إغلاق "${cancelTarget?.title}" ولن يقبل عروضًا جديدة.`}
        confirmLabel="إلغاء الطلب"
        destructive
        isPending={cancelMut.isPending}
        requireReason
        onConfirm={() => {}}
        onConfirmWithReason={(reason) => {
          if (!cancelTarget) return;
          cancelMut.mutate(
            { id: cancelTarget.id, reason },
            {
              onSuccess: () => {
                toast.success('تم إلغاء الطلب');
                setCancelTarget(null);
              },
              onError: () => toast.error('تعذّر الإلغاء'),
            },
          );
        }}
      />
    </div>
  );
}
