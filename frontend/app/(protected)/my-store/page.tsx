import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyStoreTabsHub } from '@/components/stores/MyStoreTabsHub';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'لوحة المتجر', noIndex: true });

// MY-STORE-HUB-01: one route for overview + products + collections +
// promotions + inventory + team + analytics + settings. The active tab lives
// in ?tab=… and is resolved on the client (useSearchParams) so the cached
// HTML shell is identical for every tab.
export default function MyStorePage() {
  return (
    <div className="space-y-5">
      <header className="desktop-page-header">
        <div className="min-w-0 space-y-1">
          <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">لوحة المتجر</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">أدر المنتجات والعروض والمخزون والفريق والإحصائيات من مساحة واحدة.</p>
        </div>
      </header>
      <Suspense>
        <MyStoreTabsHub />
      </Suspense>
    </div>
  );
}
