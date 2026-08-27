import type { Metadata }   from 'next';
import { Suspense }        from 'react';
import { AdminExportButton } from '@/components/admin/AdminExportButton';
import { AdminUsersTable } from '@/components/admin/AdminUsersTable';
import { buildMetadata }   from '@/lib/seo';
import { LoadingSpinner }  from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'إدارة المستخدمين', noIndex: true });

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
<h1 className="text-xl font-bold">إدارة المستخدمين</h1>
        <AdminExportButton kind="users" label="تصدير CSV" />
      </div>
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <AdminUsersTable />
      </Suspense>
    </div>
  );
}
