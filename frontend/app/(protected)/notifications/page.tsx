import type { Metadata } from 'next';
import { NotificationsPage } from '@/components/notifications/NotificationsPage';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الإشعارات', noIndex: true });

export default function NotificationsRoutePage() {
  return <NotificationsPage />;
}
