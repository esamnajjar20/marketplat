'use client';

/**
 * ACTIVITY-HUB-01 — one page for personal activity on the platform.
 *
 * Tabs: سجل النشاط · إعلاناتي · طلباتي · بلاغاتي.
 * (See lib/activityHubTabs.ts for what is NOT a tab.)
 *
 * Same deliberate choices as components/stores/MyStoreTabsHub.tsx:
 *  - Tab bodies are loaded with next/dynamic, and their chunks are included
 *    in the route's offline warming manifest.
 *  - Tab switching uses history.replaceState, NOT router.push.
 *  - Local `active` state kept in sync with useSearchParams().
 *  - Links inside the panel that point at /activity are handled in place.
 *  - Switching tabs drops per-tab query params.
 */

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ClipboardList, Flag, History, ListOrdered, Plus } from 'lucide-react';
import { TabsHub } from '@/components/shared/hub/TabsHub';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/shared/ui/Button';
import {
  ACTIVITY_HUB_PATH,
  ACTIVITY_TABS,
  DEFAULT_ACTIVITY_TAB,
  resolveActivityTab,
  searchForTabSwitch,
  type ActivityTab,
} from '@/lib/activityHubTabs';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';

const Timeline = dynamic(
  () => import('@/components/profile/Timeline').then((m) => m.Timeline),
  { loading: () => <SuspenseFallback /> },
);
const MyAdsList = dynamic(
  () => import('@/components/profile/MyAdsList').then((m) => m.MyAdsList),
  { loading: () => <SuspenseFallback /> },
);
const MyReportsList = dynamic(
  () => import('@/components/profile/MyReportsList').then((m) => m.MyReportsList),
  { loading: () => <SuspenseFallback /> },
);
const MyServiceRequestsList = dynamic(
  () => import('@/components/services/MyServiceRequestsList').then((m) => m.MyServiceRequestsList),
  { loading: () => <SuspenseFallback /> },
);

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
              <h1 className="text-[22px] font-extrabold tracking-tight">إعلاناتي</h1>
              <p className="mt-0.5 text-[13px] text-[#6B6459]">
                إدارة الإعلانات النشطة والمباعة — صفِّ حسب الحالة أو حدّد عدة عناصر.
              </p>
            </div>
            <Button size="sm" asChild className="h-10 gap-1.5 rounded-full bg-[#397F56] px-4 text-[13px] font-bold text-white hover:bg-[#1F4D33]">
              <Link prefetch={false} href={ROUTES.adCreate}>
                <Plus className="h-4 w-4" aria-hidden />
                إعلان جديد
              </Link>
            </Button>
          </div>
          <Suspense fallback={<SuspenseFallback />}>
            <MyAdsList />
          </Suspense>
        </div>
      );
    case 'requests':
      return (
        <div className="space-y-4">
          <h1 className="text-[22px] font-extrabold tracking-tight">طلباتي</h1>
          <p className="mt-0.5 text-[13px] text-[#6B6459]">
            الطلبات التي أرسلتها لمقدّمي الخدمة.
          </p>
          <Suspense fallback={<SuspenseFallback />}>
            <MyServiceRequestsList />
          </Suspense>
        </div>
      );
    case 'reports':
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight">بلاغاتي</h1>
            <p className="mt-0.5 text-[13px] text-[#6B6459]">البلاغات التي أرسلتها وحالتها.</p>
          </div>
          <Suspense fallback={<SuspenseFallback />}>
            <MyReportsList />
          </Suspense>
        </div>
      );
    case 'timeline':
    default:
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight">نشاطي</h1>
            <p className="mt-0.5 text-[13px] text-[#6B6459]">تابع نشاط حسابك وإعلاناتك وطلباتك وبلاغاتك من مكان واحد.</p>
          </div>
          <Suspense fallback={<SuspenseFallback />}>
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
