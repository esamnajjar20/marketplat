'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Package, Pause, Trash2 } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Pagination } from '@/components/shared/ui/Pagination';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { useAdminProducts } from '@/hooks/queries/useAdmin';
import { useAdminSetProductStatus } from '@/hooks/mutations/useAdminMutations';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { toast } from 'sonner';

export function AdminProductsTable() {
  const sp = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const q = sp.get('q') ?? '';
  const statusParam = sp.get('status') ?? 'ACTIVE';
  const status = ['ACTIVE', 'PAUSED', 'DELETED', 'ALL'].includes(statusParam) ? statusParam : 'ACTIVE';

  const { data, isLoading, isError, refetch } = useAdminProducts({
    page,
    limit: 20,
    q: q || undefined,
    status: status === 'ALL' ? undefined : status,
  });
  const setStatus = useAdminSetProductStatus();

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const envelope = data as {
    data?: Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> };
    meta?: { pagination?: { totalPages?: number } };
  };
  const rows: Array<Record<string, unknown>> = Array.isArray(envelope?.data)
    ? envelope.data
    : (envelope?.data as { items?: Array<Record<string, unknown>> })?.items ?? [];
  const totalPages = envelope?.meta?.pagination?.totalPages ?? 1;

  function pause(id: string) {
    setStatus.mutate(
      { id, status: 'PAUSED' },
      {
        onSuccess: () => toast.success('تم إيقاف المنتج'),
        onError: () => toast.error('تعذّر التحديث'),
      },
    );
  }

  if (isLoading) return <TableSkeleton rows={8} />;
  if (isError) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive">تعذّر تحميل المنتجات</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminFilterBar
        searchPlaceholder="بحث عن منتج…"
        tabParam="status"
        defaultTab="ACTIVE"
        tabs={[
          { value: 'ACTIVE', label: 'نشط' },
          { value: 'PAUSED', label: 'متوقف' },
          { value: 'DELETED', label: 'محذوف' },
          { value: 'ALL', label: 'الكل' },
        ]}
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-start">
            <tr>
              <th className="p-3 font-medium">المنتج</th>
              <th className="p-3 font-medium">المتجر</th>
              <th className="p-3 font-medium">السعر</th>
              <th className="p-3 font-medium">الحالة</th>
              <th className="p-3 font-medium">تاريخ</th>
              <th className="p-3 font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((p) => {
              const store = p.store as { name?: string } | undefined;
              return (
                <tr key={String(p.id)} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{String(p.name)}</td>
                  <td className="p-3 text-muted-foreground">{store?.name ?? '—'}</td>
                  <td className="p-3 tabular-nums">{formatPrice(Number(p.price))}</td>
                  <td className="p-3">
                    <Badge variant={p.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {String(p.status)}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {formatRelativeTime(String(p.createdAt))}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {p.status === 'ACTIVE' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => pause(String(p.id))}
                          disabled={setStatus.isPending}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      )}
                      {p.status !== 'DELETED' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setDeleteTarget({ id: String(p.id), name: String(p.name) })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState icon={<Package className="h-8 w-8" />} title="لا توجد منتجات" />
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
          baseUrl="/admin/products"
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="حذف هذا المنتج؟"
        description={`سيتم إخفاء "${deleteTarget?.name}" من المتجر.`}
        confirmLabel="حذف"
        destructive
        isPending={setStatus.isPending}
        requireReason
        onConfirm={() => {}}
        onConfirmWithReason={(reason) => {
          if (!deleteTarget) return;
          setStatus.mutate(
            { id: deleteTarget.id, status: 'DELETED', reason },
            {
              onSuccess: () => {
                toast.success('تم حذف المنتج');
                setDeleteTarget(null);
              },
              onError: () => toast.error('تعذّر الحذف'),
            },
          );
        }}
      />
    </div>
  );
}
