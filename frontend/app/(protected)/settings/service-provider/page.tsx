import type { Metadata } from 'next';
import { ServiceProviderSettingsSection } from '@/components/services/ServiceProviderSettingsSection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'ملف مقدم الخدمة', noIndex: true });

export default function ServiceProviderSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">ملف مقدم الخدمة</h1>
      <ServiceProviderSettingsSection />
    </div>
  );
}
