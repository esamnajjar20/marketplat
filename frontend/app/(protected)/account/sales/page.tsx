import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SalesTabsHub } from '@/components/sales/SalesTabsHub';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'مبيعاتي', noIndex: true });

export default function SalesPage() {
  return (
    <div className="space-y-5">
      <header className="desktop-page-header">
        <div className="min-w-0 space-y-1">
          <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">لوحة المبيعات</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">أدر المبيعات والعملاء والديون والأقساط والإحصائيات من مكان واحد.</p>
        </div>
      </header>
      <Suspense>
        <SalesTabsHub />
      </Suspense>
    </div>
  );
}
