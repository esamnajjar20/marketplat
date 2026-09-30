import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminExportButton } from '@/components/admin/AdminExportButton';
import { AdminUsersTable } from '@/components/admin/AdminUsersTable';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { buildMetadata } from '@/lib/seo';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export const metadata: Metadata = buildMetadata({ title: 'إدارة المستخدمين', noIndex: true });

export default function AdminUsersPage() {
  return (
    <AdminPageShell
      title="إدارة المستخدمين"
      description="حسابات، أدوار، وحالة الحساب."
      actions={<AdminExportButton kind="users" label="تصدير CSV" />}
    >
      <Suspense
        fallback={
          <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز الجدول…" />
        }
      >
        <AdminUsersTable />
      </Suspense>
    </AdminPageShell>
  );
}
