import type { Metadata } from 'next';
import { DashboardStats } from '@/components/profile/DashboardStats';
import { RecentActivityFeed } from '@/components/profile/RecentActivityFeed';
import { SellerTodayTasks } from '@/components/profile/SellerTodayTasks';
import { OnboardingChecklist } from '@/components/profile/OnboardingChecklist';
import { SellerVerificationBanner } from '@/components/sellers/SellerVerificationBanner';
import { buildMetadata } from '@/lib/seo';
import { AccountPageShell } from '@/components/shared/account/AccountPageShell';

export const metadata: Metadata = buildMetadata({ title: 'لوحة التحكم', noIndex: true });

export default function DashboardPage() {
  return (
    <AccountPageShell
      title="لوحة التحكم"
      description="ملخص سريع لنشاطك وما يحتاج انتباهك"
    >
      <div className="space-y-6">
        <OnboardingChecklist />
        <SellerVerificationBanner />
        <SellerTodayTasks />
        <DashboardStats />
        <section className="space-y-3" aria-labelledby="recent-activity-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-activity-heading" className="text-base font-semibold sm:text-lg">
              آخر النشاطات
            </h2>
          </div>
          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs sm:p-5">
            <RecentActivityFeed />
          </div>
        </section>
      </div>
    </AccountPageShell>
  );
}
