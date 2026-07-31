import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyAppointmentsSection } from '@/components/services/MyAppointmentsSection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'مواعيدي', noIndex: true });

export default function MyAppointmentsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">مواعيدي</h1>
      <Suspense>
        <MyAppointmentsSection />
      </Suspense>
    </div>
  );
}
