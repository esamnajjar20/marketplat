import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ActivityTabsHub } from '@/components/profile/ActivityTabsHub';
import { buildMetadata } from '@/lib/seo';
import { AccountPageShell } from '@/components/shared/account/AccountPageShell';

export const metadata: Metadata = buildMetadata({ title: 'نشاطي', noIndex: true });

// ACTIVITY-HUB-01: one route for timeline + my-ads + my-requests + my-reports.
// The active tab lives in ?tab=… and is resolved on the client so the cached
// HTML shell is identical for every tab. redirect via next.config.
export default function ActivityPage() {
  return (
    <AccountPageShell title="نشاطي" description="تابع نشاط حسابك وإعلاناتك وطلباتك وبلاغاتك من مكان واحد.">
      <Suspense>
        <ActivityTabsHub />
      </Suspense>
    </AccountPageShell>
  );
}
