import type { Metadata }             from 'next';
import { NotificationSettingsForm }  from '@/components/profile/NotificationSettingsForm';
import { PushNotificationToggle }    from '@/components/pwa/PushNotificationToggle';
import { buildMetadata }             from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الإشعارات', noIndex: true });

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      {/* AUDIT-FIX (protected #6): page had no <h1>, breaking the
          heading hierarchy (screen readers jumped straight to
          NotificationSettingsForm's internal <h2>). Matches the pattern
          used by profile/security/seller/service-provider. */}
      <h1 className="text-xl font-bold">الإشعارات</h1>
      <PushNotificationToggle />
      <NotificationSettingsForm />
    </div>
  );
}
