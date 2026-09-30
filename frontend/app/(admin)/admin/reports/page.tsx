import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminExportButton } from '@/components/admin/AdminExportButton';
import { AdminReportsTable } from '@/components/admin/AdminReportsTable';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { buildMetadata } from '@/lib/seo';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export const metadata: Metadata = buildMetadata({ title: 'البلاغات', noIndex: true });

export default function AdminReportsPage() {
  return (
    <AdminPageShell
      title="البلاغات"
      description="بلاغات قيد المراجعة والإجراءات."
      actions={<AdminExportButton kind="reports" label="تصدير CSV" />}
    >
      <Suspense
        fallback={
          <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز الجدول…" />
        }
      >
        <AdminReportsTable />
      </Suspense>
    </AdminPageShell>
  );
}
