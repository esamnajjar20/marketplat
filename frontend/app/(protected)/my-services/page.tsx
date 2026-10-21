import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyServicesTabsHub } from '@/components/services/MyServicesTabsHub';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'خدماتي', noIndex: true });

export default function MyServicesPage() {
  return (
    <div className="desktop-readable desktop-section space-y-4 sm:space-y-5 lg:space-y-6">
      <header className="desktop-page-header">
        <div className="min-w-0 space-y-1">
          <h1 className="text-balance text-xl font-extrabold tracking-tight sm:text-2xl">خدماتي</h1>
          <p className="max-w-2xl text-xs leading-6 text-muted-foreground sm:text-sm">
            أدر خدماتك وطلبات العملاء ومواعيدك من مكان واحد.
          </p>
        </div>
      </header>
      <Suspense>
        <MyServicesTabsHub />
      </Suspense>
    </div>
  );
}
