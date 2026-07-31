import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyServiceRequestsList } from '@/components/services/MyServiceRequestsList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'طلباتي', noIndex: true });

export default function MyServiceRequestsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">طلباتي</h1>
      <Suspense><MyServiceRequestsList /></Suspense>
    </div>
  );
}
