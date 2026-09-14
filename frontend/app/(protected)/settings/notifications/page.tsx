import type { Metadata } from 'next';
import { NotificationSettingsForm } from '@/components/profile/NotificationSettingsForm';
import { PushNotificationToggle } from '@/components/pwa/PushNotificationToggle';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'إدارة الإشعارات', noIndex: true });

export default function NotificationSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">إدارة أذونات الإشعارات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تحكم بإذن الجهاز وأنواع التنبيهات التي تريد استلامها.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">1 · إذن هذا الجهاز</h2>
        <PushNotificationToggle />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">2 · ماذا يصلك؟</h2>
        <NotificationSettingsForm />
      </section>
    </div>
  );
}
