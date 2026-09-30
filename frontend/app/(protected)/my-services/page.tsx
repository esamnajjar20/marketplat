import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyServicesTabsHub } from '@/components/services/MyServicesTabsHub';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'خدماتي', noIndex: true });

// MY-SERVICES-HUB-01: one route for overview + incoming requests +
// appointments + analytics. The active tab lives in ?tab=… and is resolved on
// the client (useSearchParams) so the cached HTML shell is identical for
// every tab.
export default function MyServicesPage() {
  return (
    <div className="space-y-6">
      <Suspense>
        <MyServicesTabsHub />
      </Suspense>
    </div>
  );
}
