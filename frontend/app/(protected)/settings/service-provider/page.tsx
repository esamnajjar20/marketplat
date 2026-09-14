import type { Metadata } from 'next';
import { UnifiedProfileSettings } from '@/components/settings/UnifiedProfileSettings';
import { ViewMyProfileLink } from '@/components/profile/ViewMyProfileLink';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'ملف مقدم الخدمة', noIndex: true });

/**
 * يفتح نفس مركز الملف مع تبويب مقدم الخدمة — الروابط القديمة تبقى صالحة.
 */
export default function ServiceProviderSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">الملف الشخصي</h1>
        <ViewMyProfileLink />
      </div>
      <UnifiedProfileSettings />
    </div>
  );
}
