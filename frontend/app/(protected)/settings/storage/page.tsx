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
        <h1 className="text-xl font-bold tracking-tight">التخزين والبيانات</h1>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
          راقب المساحة على جهازك، أدِر الكاش والتنزيلات والمسودات، وفعّل توفير البيانات للعمل
          بسلاسة حتى مع اتصال ضعيف.
        </p>
      </div>
      <StorageManagementClient />
    </div>
  );
}
