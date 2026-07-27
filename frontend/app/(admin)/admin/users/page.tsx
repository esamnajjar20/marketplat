import type { Metadata }   from 'next';
import { Suspense }        from 'react';
import { AdminUsersTable } from '@/components/admin/AdminUsersTable';
import { buildMetadata }   from '@/lib/seo';
import { LoadingSpinner }  from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'إدارة المستخدمين', noIndex: true });

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">إدارة المستخدمين</h1>
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <AdminUsersTable />
      </Suspense>
    </div>
  );
}
