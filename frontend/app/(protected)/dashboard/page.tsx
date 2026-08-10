import type { Metadata }       from 'next';
import { DashboardStats }      from '@/components/profile/DashboardStats';
import { RecentActivityFeed }  from '@/components/profile/RecentActivityFeed';
import { OnboardingChecklist } from '@/components/profile/OnboardingChecklist';
import { buildMetadata }       from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'لوحة التحكم', noIndex: true });

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">لوحة التحكم</h1>
      {/* FIX P2-8: placed above the stats so a new user (all stats at
          zero) sees "what to do" before "here's your empty numbers". */}
      <OnboardingChecklist />
      <DashboardStats />
      {/* REORG-05: QuickActions removed — 4 of its 5 buttons (publish ad,
          my ads, favorites, settings) duplicated permanent ProtectedSidebar
          links on the same screen. "طلباتي" (my service requests) moved
          into the Sidebar's "خدماتي" disclosure group (REORG-04) so no
          destination is lost. Dashboard is now pure data aggregation:
          onboarding + stats + activity, no nav duplication. */}
      <section className="space-y-3">
        <h2 className="font-semibold">آخر النشاطات</h2>
        <div className="rounded-lg border bg-card p-4">
          <RecentActivityFeed />
        </div>
      </section>
    </div>
  );
}
