import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyReportsList } from '@/components/profile/MyReportsList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'بلاغاتي', noIndex: true });

export default function MyReportsPage() {
  return (
    // FIX DESKTOP-WIDTH-01: single-column card list had no max-w, so it
    // stretched to the full <main> width on wide desktop screens (main
    // has no cap of its own — see (protected)/layout.tsx). Matches
    // NotificationsPage's existing max-w-2xl treatment for the same
    // "list of narrow cards" shape.
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">بلاغاتي</h1>
      <Suspense><MyReportsList /></Suspense>
    </div>
  );
}
