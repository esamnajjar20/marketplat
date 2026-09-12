import type { Metadata } from 'next';
import { StorageManagementClient } from '@/components/settings/StorageManagementClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'التخزين والبيانات',
  noIndex: true,
});

export default function StorageSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">التخزين والبيانات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة الملفات والكاش المحفوظة على هذا الجهاز للعمل دون اتصال.
        </p>
      </div>
      <StorageManagementClient />
    </div>
  );
}
