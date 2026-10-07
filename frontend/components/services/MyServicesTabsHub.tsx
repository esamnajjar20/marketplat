'use client';

/**
 * MY-SERVICES-HUB-01 — one page for the whole provider workspace.
 *
 * Tabs: نظرة عامة · الطلبات الواردة · المواعيد · الإحصائيات.
 * (See lib/myServicesHubTabs.ts for what is NOT a tab.)
 *
 * Same deliberate choices as components/stores/MyStoreTabsHub.tsx:
 *  - Tab bodies are STATICALLY imported, never next/dynamic (the warming
 *    engine caches only the chunks referenced by the route's HTML).
 *  - Tab switching uses history.replaceState, NOT router.push: no RSC
 *    request, so it works with no network. A local `active` state is kept in
 *    sync with useSearchParams() (URL stays the source of truth for deep
 *    links / back-forward).
 *  - Links inside the panel that point at /my-services are handled in place
 *    (capture phase).
 *  - Switching tabs drops per-tab query params (page/status/q).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { BarChart3, CalendarClock, Inbox, LayoutDashboard, Plus } from 'lucide-react';
import { TabsHub } from '@/components/shared/hub/TabsHub';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/shared/ui/Button';
import { MyServicesHub } from '@/components/services/MyServicesHub';
import { MyServiceListingsList } from '@/components/services/MyServiceListingsList';
import { IncomingServiceRequestsList } from '@/components/services/IncomingServiceRequestsList';
import { MyAppointmentsSection } from '@/components/services/MyAppointmentsSection';
import { MyServiceProviderAnalytics } from '@/components/services/MyServiceProviderAnalytics';
import {
  DEFAULT_MY_SERVICES_TAB,
  MY_SERVICES_HUB_PATH,
  MY_SERVICES_TABS,
  resolveMyServicesTab,
  searchForTabSwitch,
  type MyServicesTab,
} from '@/lib/myServicesHubTabs';

const TAB_META: Record<MyServicesTab, { label: string; description: string; Icon: typeof Inbox }> = {
  overview: { label: 'نظرة عامة', description: 'حالة العمل والإجراءات اليومية', Icon: LayoutDashboard },
  requests: { label: 'الطلبات الواردة', description: 'طلبات العملاء التي تحتاج متابعة', Icon: Inbox },
  appointments: { label: 'المواعيد', description: 'جدول مواعيدك القادمة', Icon: CalendarClock },
  analytics: { label: 'الإحصائيات', description: 'أداء الخدمات والطلبات', Icon: BarChart3 },
};

function TabBody({ tab }: { tab: MyServicesTab }) {
  switch (tab) {
    case 'requests':
      return (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold">الطلبات الواردة</h1>
            <p className="mt-1 text-sm text-muted-foreground">راجع الطلبات الجديدة واتخذ الإجراء المناسب لكل طلب.</p>
          </div>
          <Suspense>
            <IncomingServiceRequestsList />
          </Suspense>
        </div>
      );
    case 'appointments':
      return (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold">مواعيدي</h1>
            <p className="mt-1 text-sm text-muted-foreground">تابع جدولك ومواعيد الخدمات المرتبطة بطلباتك.</p>
          </div>
          <Suspense>
            <MyAppointmentsSection />
          </Suspense>
        </div>
      );
    case 'analytics':
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h1 className="text-xl font-bold">إحصائيات مقدم الخدمة</h1>
              <p className="mt-1 text-sm text-muted-foreground">مؤشرات تساعدك على فهم أداء خدماتك واتخاذ قرارات أفضل.</p>
            </div>
            <Button size="sm" asChild className="gap-1.5 font-semibold">
              <Link prefetch={false} href={ROUTES.myServiceCreate}>
                <Plus className="h-4 w-4" />
                خدمة جديدة
              </Link>
            </Button>
          </div>
          <MyServiceProviderAnalytics />
        </div>
      );
    case 'overview':
    default:
      return (
        <div className="space-y-8">
          <Suspense>
            <MyServicesHub />
          </Suspense>
          <Suspense>
            <MyServiceListingsList />
          </Suspense>
        </div>
      );
  }
}

export function MyServicesTabsHub() {
  return (
    <TabsHub<MyServicesTab>
      idPrefix="my-services"
      sectionLabel="لوحة الخدمات"
      tabListLabel="أقسام لوحة الخدمات"
      hubPath={MY_SERVICES_HUB_PATH}
      tabs={MY_SERVICES_TABS}
      defaultTab={DEFAULT_MY_SERVICES_TAB}
      meta={TAB_META}
      resolveTab={resolveMyServicesTab}
      searchForTabSwitch={searchForTabSwitch}
      renderTab={(tab) => <TabBody tab={tab} />}
    />
  );
}
