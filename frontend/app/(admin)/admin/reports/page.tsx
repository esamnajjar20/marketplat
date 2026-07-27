import type { Metadata }     from 'next';
import { Suspense }          from 'react';
import { AdminReportsTable } from '@/components/admin/AdminReportsTable';
import { buildMetadata }     from '@/lib/seo';
import { LoadingSpinner }    from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'البلاغات', noIndex: true });

export default function AdminReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">البلاغات</h1>
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <AdminReportsTable />
      </Suspense>
    </div>
  );
}
