import type { Metadata } from 'next';
import { Suspense } from 'react';
import { IncomingServiceRequestsList } from '@/components/services/IncomingServiceRequestsList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الطلبات الواردة', noIndex: true });

export default function IncomingServiceRequestsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الطلبات الواردة</h1>
      <Suspense><IncomingServiceRequestsList /></Suspense>
    </div>
  );
}
