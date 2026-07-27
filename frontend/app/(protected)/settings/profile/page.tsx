import type { Metadata }        from 'next';
import { ProfileSettingsForm }  from '@/components/profile/ProfileSettingsForm';
import { buildMetadata }        from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الملف الشخصي', noIndex: true });

export default function ProfileSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">الملف الشخصي</h1>
      <ProfileSettingsForm />
    </div>
  );
}
