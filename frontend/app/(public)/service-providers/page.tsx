import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { NearbyServiceProviders } from '@/components/services/NearbyServiceProviders';

export const metadata: Metadata = buildMetadata({
  title: 'مقدمو خدمة قريبون منك',
  path: '/service-providers',
});

export default function ServiceProvidersPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <h1 className="text-xl font-semibold">مقدمو خدمة قريبون منك</h1>
      <NearbyServiceProviders />
    </div>
  );
}
