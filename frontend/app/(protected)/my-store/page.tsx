import type { Metadata } from 'next';
import { StoreSettingsSection } from '@/components/stores/StoreSettingsSection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'متجري', noIndex: true });

export default function MyStorePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">متجري</h1>
      <StoreSettingsSection />
    </div>
  );
}
