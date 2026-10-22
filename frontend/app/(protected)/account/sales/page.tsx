import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SalesTabsHub } from '@/components/sales/SalesTabsHub';
import { buildMetadata } from '@/lib/seo';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';

export const metadata: Metadata = buildMetadata({ title: 'مبيعاتي', noIndex: true });

export default function SalesPage() {
  return (
    <div className="desktop-readable desktop-section space-y-4 sm:space-y-5 lg:space-y-6">
      <header className="desktop-page-header">
        <div className="min-w-0 space-y-1">
          <h1 className="text-balance text-xl font-extrabold tracking-tight sm:text-2xl">لوحة المبيعات</h1>
          <p className="max-w-2xl text-xs leading-6 text-muted-foreground sm:text-sm">
            تابع مبيعاتك ودفعاتك وأرباحك.
          </p>
        </div>
      </header>
      <Suspense fallback={<SuspenseFallback />}>
        <SalesTabsHub />
      </Suspense>
    </div>
  );
}
