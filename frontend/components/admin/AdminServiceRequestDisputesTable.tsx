'use client';

import { memo, useState } from 'react';
import { ShieldAlert, CheckCheck, XCircle } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { ApiError } from '@/components/shared/ApiError';
import { useAdminServiceRequestDisputes } from '@/hooks/queries/useAdmin';
import { useAdminResolveServiceRequestDispute } from '@/hooks/mutations/useAdminMutations';
import { parseApiError } from '@/lib/errorParser';

type Row = {
  id: string; status: 'DISPUTED'; disputeReason?: string | null; disputedAt?: string | null;
  customer?: { id: string; name: string } | null;
  listing?: { id: string; title: string; provider?: { id: string; businessName: string; sellerProfile?: { userId: string; displayName: string } | null } | null } | null;
};

export const AdminServiceRequestDisputesTable = memo(function AdminServiceRequestDisputesTable() {
  const { data, isLoading, isError, error, refetch } = useAdminServiceRequestDisputes({ page: 1, limit: 50 });
  const resolve = useAdminResolveServiceRequestDispute();
  const [target, setTarget] = useState<{ id: string; resolution: 'COMPLETED' | 'CANCELLED' } | null>(null);
  const items = (Array.isArray(data?.data) ? data.data : []) as Row[];

  if (isLoading) return <TableSkeleton columns={5} />;
  if (isError) return <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />;
  if (!items.length) return <EmptyState icon={<ShieldAlert className="h-10 w-10" />} title="لا توجد نزاعات" description="لا توجد طلبات خدمة متوقفة بانتظار مراجعة الإدارة." />;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-start"><tr>
            <th className="p-3 font-medium">الطلب</th><th className="p-3 font-medium">الأطراف</th><th className="p-3 font-medium">سبب النزاع</th><th className="p-3 font-medium">التاريخ</th><th className="p-3" />
          </tr></thead>
          <tbody>{items.map((r) => <tr key={r.id} className="border-t align-top [content-visibility:auto] [contain-intrinsic-size:auto_72px]">
            <td className="p-3"><div className="font-medium">{r.listing?.title ?? '—'}</div><Badge variant="destructive" className="mt-1">قيد النزاع</Badge></td>
            <td className="p-3"><div>{r.customer?.name ?? '—'}</div><div className="text-xs text-muted-foreground">{r.listing?.provider?.businessName ?? '—'}</div></td>
            <td className="max-w-[320px] p-3 whitespace-pre-wrap text-muted-foreground">{r.disputeReason ?? '—'}</td>
            <td className="p-3 text-xs text-muted-foreground">{r.disputedAt ? new Date(r.disputedAt).toLocaleString('ar') : '—'}</td>
            <td className="p-3"><div className="flex gap-2"><Button size="sm" className="gap-1" onClick={() => setTarget({ id: r.id, resolution: 'COMPLETED' })}><CheckCheck className="h-3.5 w-3.5" />إكمال</Button><Button size="sm" variant="destructive" className="gap-1" onClick={() => setTarget({ id: r.id, resolution: 'CANCELLED' })}><XCircle className="h-3.5 w-3.5" />إلغاء</Button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <ConfirmDialog
        open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(null); }}
        title={target?.resolution === 'COMPLETED' ? 'اعتماد إتمام الخدمة؟' : 'إلغاء الطلب محل النزاع؟'}
        description="سيتم إغلاق النزاع وتثبيت القرار في سجل الطلب."
        confirmLabel="تثبيت القرار" destructive={target?.resolution === 'CANCELLED'} isPending={resolve.isPending}
        onConfirm={() => { if (target) resolve.mutate(target, { onSuccess: () => setTarget(null) }); }}
      />
    </div>
  );
});
