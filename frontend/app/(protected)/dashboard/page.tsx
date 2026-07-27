import type { Metadata }       from 'next';
import { DashboardStats }      from '@/components/profile/DashboardStats';
import { QuickActions }        from '@/components/profile/QuickActions';
import { RecentActivityFeed }  from '@/components/profile/RecentActivityFeed';
import { buildMetadata }       from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'لوحة التحكم', noIndex: true });

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">لوحة التحكم</h1>
      <DashboardStats />
      <QuickActions />
      <section className="space-y-3">
        <h2 className="font-semibold">آخر النشاطات</h2>
        <div className="rounded-lg border bg-card p-4">
          <RecentActivityFeed />
        </div>
      </section>
    </div>
  );
}
