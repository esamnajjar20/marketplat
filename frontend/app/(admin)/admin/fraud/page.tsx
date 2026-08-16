import type { Metadata }   from 'next';
import { Suspense }        from 'react';
import { AdminFraudTable } from '@/components/admin/AdminFraudTable';
import { buildMetadata }   from '@/lib/seo';
import { LoadingSpinner }  from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'مكافحة الاحتيال', noIndex: true });

export default function AdminFraudPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">مكافحة الاحتيال</h1>
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <AdminFraudTable />
      </Suspense>
    </div>
  );
}
