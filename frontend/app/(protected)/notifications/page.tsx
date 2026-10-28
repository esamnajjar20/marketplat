import type { Metadata } from 'next';
import { NotificationsPage } from '@/components/notifications/NotificationsPage';
import { AccountPageShell } from '@/components/shared/account/AccountPageShell';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الإشعارات', noIndex: true });

export default function NotificationsRoutePage() {
  return (
    <AccountPageShell
      title="الإشعارات"
      description="تنبيهات الرسائل والتحديثات — يمكن تعليم الكل كمقروء من الشريط أعلاه."
    >
      <NotificationsPage />
    </AccountPageShell>
  );
}
