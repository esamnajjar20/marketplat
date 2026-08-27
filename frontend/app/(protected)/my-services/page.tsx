import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyServicesHub } from '@/components/services/MyServicesHub';
import { MyServiceListingsList } from '@/components/services/MyServiceListingsList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'خدماتي', noIndex: true });

export default function MyServicesPage() {
  return (
    <div className="space-y-8">
      <Suspense>
        <MyServicesHub />
      </Suspense>
      <Suspense>
        <MyServiceListingsList />
      </Suspense>
    </div>
  );
}
