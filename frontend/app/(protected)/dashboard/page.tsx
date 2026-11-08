import type { Metadata } from 'next';
import { DashboardStats } from '@/components/profile/DashboardStats';
import { OnboardingChecklist } from '@/components/profile/OnboardingChecklist';
import { DashboardUpdatesPanel } from '@/components/profile/DashboardUpdatesPanel';
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
        <DashboardStats />
        <DashboardUpdatesPanel />
      </div>
    </AccountPageShell>
  );
}
