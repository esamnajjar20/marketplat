'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Wrench, Pause, Trash2 } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Pagination } from '@/components/shared/ui/Pagination';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ApiError } from '@/components/shared/ApiError';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { useAdminServiceListings } from '@/hooks/queries/useAdmin';
import { useAdminSetServiceListingStatus } from '@/hooks/mutations/useAdminMutations';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { toast } from 'sonner';
import { parseApiError } from '@/lib/errorParser';

export function AdminServiceListingsTable() {
  const sp = useSearchParams();
  // SW-FIX-PAGE-NAN: clamp URL page param to positive integer.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const q = sp.get('q') ?? '';
  const statusParam = sp.get('status') ?? 'ACTIVE';
  const status = ['ACTIVE', 'PAUSED', 'DELETED', 'ALL'].includes(statusParam) ? statusParam : 'ACTIVE';

  const { data, isLoading, isError, error, refetch } = useAdminServiceListings({
    page,
    limit: 20,
    q: q || undefined,
    status: status === 'ALL' ? undefined : status,
  });
  const setStatus = useAdminSetServiceListingStatus();

  // FIX SERVICE-LISTINGS-POLISH-01: setStatus is a single shared mutation
  // instance, so `setStatus.isPending` disabled EVERY row's Pause/Delete
  // buttons while one row was in flight. Track the specific id in flight,
  // same pattern as AdminUsersTable / AdminAdsTable / AdminProductsTable.
  const pendingStatusId = setStatus.isPending ? setStatus.variables?.id : undefined;
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const envelope = data as {
    data?: Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> };
    meta?: { pagination?: { totalPages?: number } };
  };
  const rows: Array<Record<string, unknown>> = Array.isArray(envelope?.data)
    ? envelope.data
    : (envelope?.data as { items?: Array<Record<string, unknown>> })?.items ?? [];
  const totalPages = envelope?.meta?.pagination?.totalPages ?? 1;

  if (isLoading) return <TableSkeleton columns={6} />;
  // FIX SERVICE-LISTINGS-POLISH-01 (part 2): shared ApiError (401/403/404/500+).
  if (isError) {
    return <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />;
  }

  return (
    <div className="space-y-4">
      <AdminFilterBar
        searchPlaceholder="بحث عن خدمة…"
        tabParam="status"
        defaultTab="ACTIVE"
        tabs={[
          { value: 'ACTIVE', label: 'نشط' },
          { value: 'PAUSED', label: 'متوقف' },
          { value: 'DELETED', label: 'محذوف' },
          { value: 'ALL', label: 'الكل' },
        ]}
      />

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
      {rows.map((row) => {
        const provider = row.provider as { businessName?: string } | undefined;
        return (
        <div key={String(row.id)} className="rounded-xl border border-border bg-card p-3 shadow-xs">
          <div className="space-y-1">
            <p className="text-sm font-semibold leading-snug">{String(row.title)}</p>
            <p className="text-xs text-muted-foreground">{provider?.businessName ?? '—'}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-primary">
                {row.price != null ? formatPrice(Number(row.price)) : '—'}
              </span>
              <Badge variant={row.status === 'ACTIVE' ? 'success' : 'secondary'} className="text-xs">
                {String(row.status)}
              </Badge>
            </div>
          </div>
          <div className="mt-2 flex justify-end gap-1 border-t border-border/60 pt-2">
              {row.status === 'ACTIVE' && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`إيقاف الخدمة ${String(row.title)}`}
                  disabled={pendingStatusId === String(row.id)}
                  onClick={() =>
                    setStatus.mutate(
                      { id: String(row.id), status: 'PAUSED' },
                      { onSuccess: () => toast.success('تم إيقاف الخدمة') },
                    )
                  }>
                  <Pause className="h-4 w-4" />
                </Button>
              )}
              {row.status !== 'DELETED' && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  aria-label={`حذف الخدمة ${String(row.title)}`}
                  onClick={() => setDeleteTarget({ id: String(row.id), title: String(row.title) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
          </div>
        </div>
        );
      })}
      {rows.length === 0 && (
        <EmptyState icon={<Wrench className="h-8 w-8" />} title="لا توجد خدمات" />
      )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full min-w-[640px] text-sm [&_th:last-child]:sticky [&_th:last-child]:end-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-muted/50 [&_td:last-child]:sticky [&_td:last-child]:end-0 [&_td:last-child]:z-10 [&_td:last-child]:bg-background [&_td:last-child]:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
          <thead className="bg-muted/50 text-start">
            <tr>
              <th className="p-3 font-medium">الخدمة</th>
              <th className="p-3 font-medium">المزوّد</th>
              <th className="p-3 font-medium">السعر</th>
              <th className="p-3 font-medium">الحالة</th>
              <th className="p-3 font-medium">تاريخ</th>
              <th className="p-3 font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const provider = row.provider as { businessName?: string } | undefined;
              return (
                <tr key={String(row.id)} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{String(row.title)}</td>
                  <td className="p-3 text-muted-foreground">{provider?.businessName ?? '—'}</td>
                  <td className="p-3 tabular-nums">
                    {row.price != null ? formatPrice(Number(row.price)) : '—'}
                  </td>
                  <td className="p-3">
                    <Badge variant={row.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {String(row.status)}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {formatRelativeTime(String(row.createdAt))}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                        {row.status === 'ACTIVE' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`إيقاف الخدمة ${String(row.title)}`}
                            disabled={pendingStatusId === String(row.id)}
                            onClick={() =>
                              setStatus.mutate(
                                { id: String(row.id), status: 'PAUSED' },
                                { onSuccess: () => toast.success('تم إيقاف الخدمة') },
                              )
                            }
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                        {row.status !== 'DELETED' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            aria-label={`حذف الخدمة ${String(row.title)}`}
                            onClick={() =>
                              setDeleteTarget({ id: String(row.id), title: String(row.title) })
                            }
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
                  <EmptyState icon={<Wrench className="h-8 w-8" />} title="لا توجد خدمات" />
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
          baseUrl="/admin/service-listings"
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="حذف هذه الخدمة؟"
        description={`سيتم إخفاء "${deleteTarget?.title}" من الدليل.`}
        confirmLabel="حذف"
        destructive
        isPending={setStatus.isPending && pendingStatusId === deleteTarget?.id}
        requireReason
        onConfirm={() => {}}
        onConfirmWithReason={(reason) => {
          if (!deleteTarget) return;
          setStatus.mutate(
            { id: deleteTarget.id, status: 'DELETED', reason },
            {
              onSuccess: () => {
                toast.success('تم حذف الخدمة');
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
