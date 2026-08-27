import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminServiceListingsTable } from '@/components/admin/AdminServiceListingsTable';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'إدارة الخدمات', noIndex: true });

export default function AdminServiceListingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">عروض الخدمات</h1>
      <Suspense>
        <AdminServiceListingsTable />
      </Suspense>
    </div>
  );
}
