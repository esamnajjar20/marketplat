import type { Metadata } from 'next';
import { BroadcastNotificationButton } from '@/components/admin/BroadcastNotificationButton';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'إدارة الإشعارات', noIndex: true });

export default function AdminNotificationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">الإشعارات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            بث إشعارات ترويجية لجميع المستخدمين أو مجموعة محددة، ومتابعة الإحصائيات.
          </p>
        </div>
        <BroadcastNotificationButton />
      </div>
    </div>
  );
}
