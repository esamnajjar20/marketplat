import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ActivityTabsHub } from '@/components/profile/ActivityTabsHub';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'نشاطي', noIndex: true });

// ACTIVITY-HUB-01: one route for timeline + my-ads + my-requests + my-reports.
// The active tab lives in ?tab=… and is resolved on the client so the cached
// HTML shell is identical for every tab. redirect via next.config.
export default function ActivityPage() {
  return (
    <div className="space-y-5">
      <header className="desktop-page-header">
        <div className="min-w-0 space-y-1">
          <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">نشاطي</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">تابع نشاط حسابك وإعلاناتك وطلباتك وبلاغاتك من مكان واحد.</p>
        </div>
      </header>
      <Suspense>
        <ActivityTabsHub />
      </Suspense>
    </div>
  );
}
