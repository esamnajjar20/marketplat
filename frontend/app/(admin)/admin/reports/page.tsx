import type { Metadata }     from 'next';
import { Suspense }          from 'react';
import { AdminExportButton } from '@/components/admin/AdminExportButton';
import { AdminReportsTable } from '@/components/admin/AdminReportsTable';
import { buildMetadata }     from '@/lib/seo';
import { LoadingSpinner }    from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'البلاغات', noIndex: true });

export default function AdminReportsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
<h1 className="text-xl font-bold">البلاغات</h1>
        <AdminExportButton kind="reports" label="تصدير CSV" />
      </div>
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <AdminReportsTable />
      </Suspense>
    </div>
  );
}
