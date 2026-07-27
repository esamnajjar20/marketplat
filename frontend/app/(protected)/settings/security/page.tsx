import type { Metadata }       from 'next';
import { SecuritySettingsForm } from '@/components/profile/SecuritySettingsForm';
import { DeleteAccountSection } from '@/components/profile/DeleteAccountSection';
import { buildMetadata }       from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الأمان', noIndex: true });

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">إعدادات الأمان</h1>
      <SecuritySettingsForm />
      <DeleteAccountSection />
    </div>
  );
}
