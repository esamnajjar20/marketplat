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

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BarChart3, CalendarClock, Inbox, LayoutDashboard, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
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

const TAB_META: Record<MyServicesTab, { label: string; Icon: typeof Inbox }> = {
  overview: { label: 'نظرة عامة', Icon: LayoutDashboard },
  requests: { label: 'الطلبات الواردة', Icon: Inbox },
  appointments: { label: 'المواعيد', Icon: CalendarClock },
  analytics: { label: 'الإحصائيات', Icon: BarChart3 },
};

function TabBody({ tab }: { tab: MyServicesTab }) {
  switch (tab) {
    case 'requests':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-bold">الطلبات الواردة</h1>
          <Suspense>
            <IncomingServiceRequestsList />
          </Suspense>
        </div>
      );
    case 'appointments':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-bold">مواعيدي</h1>
          <Suspense>
            <MyAppointmentsSection />
          </Suspense>
        </div>
      );
    case 'analytics':
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h1 className="text-xl font-bold">إحصائيات مقدم الخدمة</h1>
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
  const sp = useSearchParams();
  const urlTab: MyServicesTab =
    resolveMyServicesTab(sp.toString() ? `?${sp.toString()}` : '') ?? DEFAULT_MY_SERVICES_TAB;

  // Next.js does not reliably re-render on history.replaceState, so keep a
  // local tab state alongside the URL (same fix as MY-STORE-TAB-STATE-FIX-01).
  const [active, setActive] = useState<MyServicesTab>(urlTab);

  useEffect(() => {
    setActive(urlTab);
  }, [urlTab]);

  const writeUrl = useCallback((search: string) => {
    try {
      window.history.replaceState(window.history.state, '', `${MY_SERVICES_HUB_PATH}${search}`);
    } catch {
      /* non-fatal */
    }
  }, []);

  const select = useCallback(
    (tab: MyServicesTab) => {
      writeUrl(searchForTabSwitch(tab));
      setActive(tab);
      window.scrollTo({ top: 0 });
    },
    [writeUrl],
  );

  const onPanelClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as HTMLElement).closest?.('a');
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      try {
        const url = new URL(a.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname.replace(/\/+$/, '') !== MY_SERVICES_HUB_PATH) return;
        e.preventDefault();
        e.stopPropagation();
        writeUrl(url.search);
        setActive(resolveMyServicesTab(url.search) ?? DEFAULT_MY_SERVICES_TAB);
        window.scrollTo({ top: 0 });
      } catch {
        /* unparsable link — let the browser handle it */
      }
    },
    [writeUrl],
  );

  return (
    <section aria-label="لوحة الخدمات" className="w-full text-start">
      <div
        role="tablist"
        aria-label="أقسام لوحة الخدمات"
        className="sticky top-0 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur"
      >
        {MY_SERVICES_TABS.map((tab) => {
          const { label, Icon } = TAB_META[tab];
          const selected = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`my-services-tab-${tab}`}
              aria-selected={selected}
              aria-controls={`my-services-panel-${tab}`}
              onClick={() => select(tab)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden={true} />
              {label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`my-services-panel-${active}`}
        aria-labelledby={`my-services-tab-${active}`}
        onClickCapture={onPanelClickCapture}
      >
        <TabBody tab={active} />
      </div>
    </section>
  );
}
