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
    <div className="desktop-readable desktop-section space-y-4 sm:space-y-5 lg:space-y-6">
      <header className="desktop-page-header">
        <div className="min-w-0 space-y-1">
          <h1 className="text-balance text-xl font-extrabold tracking-tight sm:text-2xl">لوحة المتجر</h1>
          <p className="max-w-2xl text-xs leading-6 text-muted-foreground sm:text-sm">
            أدر منتجاتك وعروضك ومخزونك من مكان واحد.
          </p>
        </div>
      </header>
      <Suspense>
        <MyStoreTabsHub />
      </Suspense>
    </div>
  );
}
