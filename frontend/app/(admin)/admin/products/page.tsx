import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminProductsTable } from '@/components/admin/AdminProductsTable';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'إدارة المنتجات', noIndex: true });

export default function AdminProductsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">المنتجات</h1>
      <Suspense>
        <AdminProductsTable />
      </Suspense>
    </div>
  );
}
