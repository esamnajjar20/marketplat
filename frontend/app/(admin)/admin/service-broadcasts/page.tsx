import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminServiceBroadcastsTable } from '@/components/admin/AdminServiceBroadcastsTable';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'إدارة طلبات الخدمة', noIndex: true });

export default function AdminServiceBroadcastsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">طلبات الخدمة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          سوق الطلبات — مراجعة وإلغاء الطلبات المفتوحة عند الحاجة.
        </p>
      </div>
      <Suspense>
        <AdminServiceBroadcastsTable />
      </Suspense>
    </div>
  );
}
