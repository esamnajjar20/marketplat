import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ServiceProviderSettingsSection } from '@/components/services/ServiceProviderSettingsSection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'ملف مقدم الخدمة', noIndex: true });

export default function ServiceProviderSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">ملف مقدم الخدمة</h1>
      {/* FIX P0-1: BecomeServiceProviderCard now reads useSearchParams()
          for ?from= — same Suspense requirement as the seller/store
          settings pages. */}
      <Suspense>
        <ServiceProviderSettingsSection />
      </Suspense>
    </div>
  );
}
