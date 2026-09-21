import type { Metadata }   from 'next';
import dynamic from 'next/dynamic';
import { BroadcastNotificationButton } from '@/components/admin/BroadcastNotificationButton';
import { buildMetadata }   from '@/lib/seo';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

export const metadata: Metadata = buildMetadata({ title: 'لوحة الإدارة', noIndex: true });

// FIX ADMIN-STORM-LAZY-01: same reasoning as /admin/system above —
// the dashboard mounted four query-heavy widgets statically, and
// all four fired their queries in the same commit tick. Dynamic
// chunks keep them out of the initial bundle and give each a
// Suspense-driven loading state. BroadcastNotificationButton stays
// static: it's a small button that only fires a mutation when
// clicked, so there's nothing to defer.
const AdminStatsGrid = dynamic(
  () => import('@/components/admin/AdminStatsGrid').then((m) => m.AdminStatsGrid),
  { loading: () => <PageLoadingState variant="cards" title="جارٍ تحميل الإحصائيات" description="…" /> },
);

const AdminOpsQueue = dynamic(
  () => import('@/components/admin/AdminOpsQueue').then((m) => m.AdminOpsQueue),
  { loading: () => <PageLoadingState variant="list" title="جارٍ تحميل قائمة العمليات" description="…" /> },
);

const AdminPlatformTrends = dynamic(
  () => import('@/components/admin/AdminPlatformTrends').then((m) => m.AdminPlatformTrends),
  { loading: () => <PageLoadingState variant="cards" title="جارٍ تحميل الاتجاهات" description="…" /> },
);

const AdminRecentActivity = dynamic(
  () => import('@/components/admin/AdminRecentActivity').then((m) => m.AdminRecentActivity),
  { loading: () => <PageLoadingState variant="list" title="جارٍ تحميل النشاط" description="…" /> },
);

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">نظرة عامة</h1>
        {/*
         * FEAT: closes the gap where POST /admin/notifications/broadcast
         * existed fully server-side with no reachable UI anywhere.
         */}
        <BroadcastNotificationButton />
      </div>
      <AdminOpsQueue />
      <AdminPlatformTrends />
      <AdminStatsGrid />
      {/*
       * FIX DEAD-04: AdminRecentActivity was fully built and tested but
       * never rendered anywhere — the dashboard showed stats with no
       * activity feed at all beneath them.
       */}
      <div className="space-y-3">
        <h2 className="font-semibold">أحدث الإعلانات</h2>
        <AdminRecentActivity />
      </div>
    </div>
  );
}
