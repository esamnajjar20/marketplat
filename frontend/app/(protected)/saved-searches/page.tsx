import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SavedSearchesList } from '@/components/profile/SavedSearchesList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'عمليات البحث المحفوظة', noIndex: true });

export default function SavedSearchesPage() {
  return (
    // FIX DESKTOP-WIDTH-01: see my-reports/page.tsx's matching comment.
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">عمليات البحث المحفوظة</h1>
      <Suspense><SavedSearchesList /></Suspense>
    </div>
  );
}
