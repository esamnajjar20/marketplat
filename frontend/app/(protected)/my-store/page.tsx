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
    <div className="space-y-6">
      <Suspense>
        <MyStoreTabsHub />
      </Suspense>
    </div>
  );
}
