import type { Metadata }        from 'next';
import { Suspense }             from 'react';
import { AdminAuditLogsTable }  from '@/components/admin/AdminAuditLogsTable';
import { buildMetadata }        from '@/lib/seo';
import { LoadingSpinner }       from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'سجل العمليات', noIndex: true });

export default function AdminAuditLogsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">سجل العمليات</h1>
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <AdminAuditLogsTable />
      </Suspense>
    </div>
  );
}
