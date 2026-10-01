'use client';

/**
 * ACTIVITY-HUB-01 — one page for personal activity on the platform.
 *
 * Tabs: سجل النشاط · إعلاناتي · طلباتي · بلاغاتي.
 * (See lib/activityHubTabs.ts for what is NOT a tab.)
 *
 * Same deliberate choices as components/stores/MyStoreTabsHub.tsx:
 *  - Tab bodies are STATICALLY imported, never next/dynamic.
 *  - Tab switching uses history.replaceState, NOT router.push.
 *  - Local `active` state kept in sync with useSearchParams().
 *  - Links inside the panel that point at /activity are handled in place.
 *  - Switching tabs drops per-tab query params.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { ClipboardList, Flag, History, ListOrdered, Plus } from 'lucide-react';
import { TabsHub } from '@/components/shared/hub/TabsHub';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/shared/ui/Button';
import { Timeline } from '@/components/profile/Timeline';
import { MyAdsList } from '@/components/profile/MyAdsList';
import { MyReportsList } from '@/components/profile/MyReportsList';
import { MyServiceRequestsList } from '@/components/services/MyServiceRequestsList';
import {
  ACTIVITY_HUB_PATH,
  ACTIVITY_TABS,
  DEFAULT_ACTIVITY_TAB,
  resolveActivityTab,
  searchForTabSwitch,
  type ActivityTab,
} from '@/lib/activityHubTabs';

const TAB_META: Record<ActivityTab, { label: string; Icon: typeof History }> = {
  timeline: { label: 'سجل النشاط', Icon: History },
  ads: { label: 'إعلاناتي', Icon: ListOrdered },
  requests: { label: 'طلباتي', Icon: ClipboardList },
  reports: { label: 'بلاغاتي', Icon: Flag },
};

function TabBody({ tab }: { tab: ActivityTab }) {
  switch (tab) {
    case 'ads':
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold">إعلاناتي</h1>
              <p className="text-sm text-muted-foreground">
                إدارة الإعلانات النشطة والمباعة — صفِّ حسب الحالة أو حدّد عدة عناصر.
              </p>
            </div>
            <Button size="sm" asChild className="min-h-10 gap-1.5">
              <Link prefetch={false} href={ROUTES.adCreate}>
                <Plus className="h-4 w-4" aria-hidden />
                إعلان جديد
              </Link>
            </Button>
          </div>
          <Suspense>
            <MyAdsList />
          </Suspense>
        </div>
      );
    case 'requests':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-bold">طلباتي</h1>
          <p className="text-sm text-muted-foreground">
            الطلبات التي أرسلتها لمقدّمي الخدمة.
          </p>
          <Suspense>
            <MyServiceRequestsList />
          </Suspense>
        </div>
      );
    case 'reports':
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="text-xl font-bold">بلاغاتي</h1>
          <Suspense>
            <MyReportsList />
          </Suspense>
        </div>
      );
    case 'timeline':
    default:
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="text-xl font-bold">نشاطي</h1>
          <Suspense>
            <Timeline />
          </Suspense>
        </div>
      );
  }
}

export function ActivityTabsHub() {
  return (
    <TabsHub<ActivityTab>
      idPrefix="activity"
      sectionLabel="نشاطي"
      tabListLabel="أقسام النشاط"
      hubPath={ACTIVITY_HUB_PATH}
      tabs={ACTIVITY_TABS}
      defaultTab={DEFAULT_ACTIVITY_TAB}
      meta={TAB_META}
      resolveTab={resolveActivityTab}
      searchForTabSwitch={searchForTabSwitch}
      renderTab={(tab) => <TabBody tab={tab} />}
    />
  );
}
