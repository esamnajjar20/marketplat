import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminOpenRequestsTable } from '@/components/admin/AdminOpenRequestsTable';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'إدارة الطلبات المفتوحة', noIndex: true });

export default function AdminOpenRequestsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">الطلبات المفتوحة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          طلبات الخدمة والمنتج والإيجار — مراجعة وإلغاء الطلبات عند الحاجة.
        </p>
      </div>
      <Suspense>
        <AdminOpenRequestsTable />
      </Suspense>
    </div>
  );
}
