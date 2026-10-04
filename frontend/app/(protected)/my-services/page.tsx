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
    <div className="space-y-5">
      <header className="desktop-page-header">
        <div className="min-w-0 space-y-1">
          <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">لوحة الخدمات</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">أدر خدماتك والطلبات الواردة والمواعيد والإحصائيات من مكان واحد.</p>
        </div>
      </header>
      <Suspense>
        <MyServicesTabsHub />
      </Suspense>
    </div>
  );
}
