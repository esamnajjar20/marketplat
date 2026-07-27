import type { Metadata }  from 'next';
import { Suspense }       from 'react';
import { AdminAdsTable }  from '@/components/admin/AdminAdsTable';
import { buildMetadata }  from '@/lib/seo';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'إدارة الإعلانات', noIndex: true });

export default function AdminAdsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">إدارة الإعلانات</h1>
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <AdminAdsTable />
      </Suspense>
    </div>
  );
}
