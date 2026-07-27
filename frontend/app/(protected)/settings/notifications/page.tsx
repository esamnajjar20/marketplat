import type { Metadata }             from 'next';
import { NotificationSettingsForm }  from '@/components/profile/NotificationSettingsForm';
import { PushNotificationToggle }    from '@/components/pwa/PushNotificationToggle';
import { buildMetadata }             from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الإشعارات', noIndex: true });

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <PushNotificationToggle />
      <NotificationSettingsForm />
    </div>
  );
}
