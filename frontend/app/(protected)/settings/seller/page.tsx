import type { Metadata } from 'next';
import { SellerSettingsSection } from '@/components/sellers/SellerSettingsSection';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'ملف البائع', noIndex: true });

export default function SellerSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">ملف البائع</h1>
      <SellerSettingsSection />
    </div>
  );
}
