import type { Metadata }    from 'next';
import { Suspense }         from 'react';
import { AdminStoresTable } from '@/components/admin/AdminStoresTable';
import { buildMetadata }    from '@/lib/seo';
import { LoadingSpinner }   from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'إدارة المتاجر', noIndex: true });

export default function AdminStoresPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">إدارة المتاجر</h1>
      {/*
        AUDIT-FIX (issue #1 — 🔴 critical): closes the report's core
        finding for this section. createStore required admin approval
        (PENDING → ACTIVE) but no endpoint could list PENDING stores,
        so every new store stayed PENDING forever with zero reachable
        path to going live. This page + AdminStoresTable is that
        missing approval UI.
      */}
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <AdminStoresTable />
      </Suspense>
    </div>
  );
}
