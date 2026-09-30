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

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ClipboardList, Flag, History, ListOrdered, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const sp = useSearchParams();
  const urlTab: ActivityTab =
    resolveActivityTab(sp.toString() ? `?${sp.toString()}` : '') ?? DEFAULT_ACTIVITY_TAB;

  // Next.js does not reliably re-render on history.replaceState, so keep a
  // local tab state alongside the URL (same fix as MY-STORE-TAB-STATE-FIX-01).
  const [active, setActive] = useState<ActivityTab>(urlTab);

  useEffect(() => {
    setActive(urlTab);
  }, [urlTab]);

  const writeUrl = useCallback((search: string) => {
    try {
      window.history.replaceState(window.history.state, '', `${ACTIVITY_HUB_PATH}${search}`);
    } catch {
      /* non-fatal */
    }
  }, []);

  const select = useCallback(
    (tab: ActivityTab) => {
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
        if (url.pathname.replace(/\/+$/, '') !== ACTIVITY_HUB_PATH) return;
        e.preventDefault();
        e.stopPropagation();
        writeUrl(url.search);
        setActive(resolveActivityTab(url.search) ?? DEFAULT_ACTIVITY_TAB);
        window.scrollTo({ top: 0 });
      } catch {
        /* unparsable link — let the browser handle it */
      }
    },
    [writeUrl],
  );

  return (
    <section aria-label="نشاطي" className="w-full text-start">
      <div
        role="tablist"
        aria-label="أقسام النشاط"
        className="sticky top-0 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur"
      >
        {ACTIVITY_TABS.map((tab) => {
          const { label, Icon } = TAB_META[tab];
          const selected = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`activity-tab-${tab}`}
              aria-selected={selected}
              aria-controls={`activity-panel-${tab}`}
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
        id={`activity-panel-${active}`}
        aria-labelledby={`activity-tab-${active}`}
        onClickCapture={onPanelClickCapture}
      >
        <TabBody tab={active} />
      </div>
    </section>
  );
}
