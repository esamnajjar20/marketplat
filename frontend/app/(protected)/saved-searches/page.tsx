import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SavedSearchesList } from '@/components/profile/SavedSearchesList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'عمليات البحث المحفوظة', noIndex: true });

export default function SavedSearchesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">عمليات البحث المحفوظة</h1>
      <Suspense><SavedSearchesList /></Suspense>
    </div>
  );
}
