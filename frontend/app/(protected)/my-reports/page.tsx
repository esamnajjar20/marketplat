import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyReportsList } from '@/components/profile/MyReportsList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'بلاغاتي', noIndex: true });

export default function MyReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">بلاغاتي</h1>
      <Suspense><MyReportsList /></Suspense>
    </div>
  );
}
