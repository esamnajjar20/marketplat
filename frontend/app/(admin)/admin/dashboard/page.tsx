import type { Metadata } from 'next';
import { AdminStatsGrid } from '@/components/admin/AdminStatsGrid';
import { AdminRecentActivity } from '@/components/admin/AdminRecentActivity';
import { BroadcastNotificationButton } from '@/components/admin/BroadcastNotificationButton';
import { AdminOpsQueue } from '@/components/admin/AdminOpsQueue';
import { AdminPlatformTrends } from '@/components/admin/AdminPlatformTrends';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'لوحة الإدارة', noIndex: true });

export default function AdminDashboardPage() {
  return (
    <AdminPageShell
      title="نظرة عامة"
      description="ملخص المنصة، الطوابير، وأحدث النشاط."
      actions={<BroadcastNotificationButton />}
    >
      <AdminOpsQueue />
      <AdminPlatformTrends />
      <AdminStatsGrid />
      <section className="space-y-3">
        <h2 className="text-base font-semibold">أحدث الإعلانات</h2>
        <AdminRecentActivity />
      </section>
    </AdminPageShell>
  );
}
