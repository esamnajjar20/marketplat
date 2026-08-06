import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Timeline } from '@/components/profile/Timeline';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'نشاطي', noIndex: true });

export default function ActivityPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">نشاطي</h1>
      <Suspense><Timeline /></Suspense>
    </div>
  );
}
