import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminStoresTable } from '@/components/admin/AdminStoresTable';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { buildMetadata } from '@/lib/seo';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export const metadata: Metadata = buildMetadata({ title: 'إدارة المتاجر', noIndex: true });

export default function AdminStoresPage() {
  return (
    <AdminPageShell title="إدارة المتاجر" description="المتاجر والخطة والحالة.">
      <Suspense
        fallback={
          <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز الجدول…" />
        }
      >
        <AdminStoresTable />
      </Suspense>
    </AdminPageShell>
  );
}
