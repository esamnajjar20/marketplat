import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SavedSearchesList } from '@/components/profile/SavedSearchesList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'عمليات البحث المحفوظة', noIndex: true });

export default function SavedSearchesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">عمليات البحث المحفوظة</h1>
          <p className="mt-1 text-sm text-muted-foreground">عمليات البحث التي حفظتها للوصول إليها بسرعة.</p>
        </div>
      </header>
      <Suspense><SavedSearchesList /></Suspense>
    </div>
  );
}
