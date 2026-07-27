import type { Metadata }   from 'next';
import { AdminStatsGrid }  from '@/components/admin/AdminStatsGrid';
import { AdminRecentActivity } from '@/components/admin/AdminRecentActivity';
import { buildMetadata }   from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'لوحة الإدارة', noIndex: true });

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">نظرة عامة</h1>
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
