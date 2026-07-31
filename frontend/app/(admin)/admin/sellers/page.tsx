import type { Metadata }     from 'next';
import { Suspense }          from 'react';
import { AdminSellersTable } from '@/components/admin/AdminSellersTable';
import { buildMetadata }     from '@/lib/seo';
import { LoadingSpinner }    from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'إدارة البائعين', noIndex: true });

export default function AdminSellersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">إدارة البائعين</h1>
      {/*
        EPIC 1.1: closes the report's core finding for this section —
        verify/suspend existed fully server-side with zero reachable
        UI. This page + AdminSellersTable is that missing UI.
      */}
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <AdminSellersTable />
      </Suspense>
    </div>
  );
}
