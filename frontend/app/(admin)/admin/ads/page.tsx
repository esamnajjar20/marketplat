import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminAdsTable } from '@/components/admin/AdminAdsTable';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { buildMetadata } from '@/lib/seo';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export const metadata: Metadata = buildMetadata({ title: 'إدارة الإعلانات', noIndex: true });

export default function AdminAdsPage() {
  return (
    <AdminPageShell
      title="إدارة الإعلانات"
      description="مراجعة الإعلانات، الحالة، والإجراءات الجماعية."
    >
      <Suspense
        fallback={
          <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز الجدول…" />
        }
      >
        <AdminAdsTable />
      </Suspense>
    </AdminPageShell>
  );
}
