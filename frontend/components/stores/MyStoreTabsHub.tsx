'use client';

/**
 * MY-STORE-HUB-01 — one page for the whole store-management surface.
 *
 * Tabs: نظرة عامة · المنتجات · المجموعات · العروض · المخزون · الفريق ·
 * الإحصائيات · الإعدادات. (See lib/myStoreHubTabs.ts for what is NOT a tab.)
 *
 * Same deliberate choices as components/offline/OfflineHub.tsx:
 *  - Tab bodies are STATICALLY imported, never next/dynamic. The warming
 *    engine caches only the chunks referenced by the route's HTML; a lazy
 *    tab would be blank the first time it is opened offline.
 *  - Tab switching uses history.replaceState, NOT router.push: no RSC request,
 *    so switching works with no network at all. Next.js syncs replaceState
 *    into useSearchParams(), which is our single source of truth for the
 *    active tab (so list components that router.push('/my-store?tab=…&page=2')
 *    keep the tab in sync too — no duplicated local state).
 *  - Links inside the panel that point at /my-store are handled in place
 *    (capture phase), so "المنتجات ← المجموعات" never hits the network.
 *  - Switching tabs drops per-tab query params (page/status/…): they belong to
 *    the tab you left.
 */

import { Suspense, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  BarChart3,
  Boxes,
  Layers,
  LayoutDashboard,
  Package,
  PackagePlus,
  Settings,
  Tag,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/shared/ui/Button';
import { MyStoreHub } from '@/components/stores/MyStoreHub';
import { MyProductsList } from '@/components/stores/MyProductsList';
import { MyCollectionsList } from '@/components/stores/MyCollectionsList';
import { MyPromotionsList } from '@/components/stores/MyPromotionsList';
import { MyStoreInventory } from '@/components/stores/MyStoreInventory';
import { MyStoreMembersList } from '@/components/stores/MyStoreMembersList';
import { MyMemberInvites } from '@/components/stores/MyMemberInvites';
import { MyStoreAnalytics } from '@/components/stores/MyStoreAnalytics';
import { StoreSettingsSection } from '@/components/stores/StoreSettingsSection';
import {
  DEFAULT_MY_STORE_TAB,
  MY_STORE_HUB_PATH,
  MY_STORE_TABS,
  resolveMyStoreTab,
  searchForTabSwitch,
  type MyStoreTab,
} from '@/lib/myStoreHubTabs';

const TAB_META: Record<MyStoreTab, { label: string; Icon: typeof Package }> = {
  overview: { label: 'نظرة عامة', Icon: LayoutDashboard },
  products: { label: 'المنتجات', Icon: Package },
  collections: { label: 'المجموعات', Icon: Layers },
  promotions: { label: 'العروض', Icon: Tag },
  inventory: { label: 'المخزون', Icon: Boxes },
  members: { label: 'الفريق', Icon: Users },
  analytics: { label: 'الإحصائيات', Icon: BarChart3 },
  settings: { label: 'الإعدادات', Icon: Settings },
};

function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h1 className="text-xl font-bold">{title}</h1>
      {children ? <p className="text-sm text-muted-foreground">{children}</p> : null}
    </div>
  );
}

function TabBody({ tab }: { tab: MyStoreTab }) {
  switch (tab) {
    case 'products':
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-bold">منتجاتي</h1>
            <Link prefetch={false} href={ROUTES.myStoreProductCreate}>
              <Button size="sm" className="gap-1.5">
                <PackagePlus className="h-4 w-4" />
                منتج جديد
              </Button>
            </Link>
          </div>
          <Suspense>
            <MyProductsList />
          </Suspense>
        </div>
      );
    case 'collections':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-bold">مجموعات المتجر</h1>
          <Suspense>
            <MyCollectionsList />
          </Suspense>
        </div>
      );
    case 'promotions':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-bold">العروض</h1>
          <Suspense>
            <MyPromotionsList />
          </Suspense>
        </div>
      );
    case 'inventory':
      return (
        <Suspense>
          <MyStoreInventory />
        </Suspense>
      );
    case 'members':
      return (
        <div className="space-y-6">
          <PageTitle title="فريق المتجر">
            أضف مديرين أو محرري منتجات وحدد صلاحيات كل شخص
          </PageTitle>
          <Suspense>
            <MyMemberInvites />
          </Suspense>
          <Suspense>
            <MyStoreMembersList />
          </Suspense>
        </div>
      );
    case 'analytics':
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-bold">إحصائيات المتجر</h1>
            <Button size="sm" asChild className="gap-1.5 font-semibold">
              <Link prefetch={false} href={ROUTES.myStoreProductCreate}>
                <PackagePlus className="h-4 w-4" />
                إضافة منتج
              </Link>
            </Button>
          </div>
          <MyStoreAnalytics />
        </div>
      );
    case 'settings':
      return (
        <div className="space-y-6">
          <PageTitle title="إعدادات المتجر">
            الاسم، الوصف، الشعار، الغلاف، ساعات العمل، والموقع
          </PageTitle>
          <Suspense>
            <StoreSettingsSection />
          </Suspense>
        </div>
      );
    case 'overview':
    default:
      return <MyStoreHub />;
  }
}

export function MyStoreTabsHub() {
  const sp = useSearchParams();
  const active: MyStoreTab = resolveMyStoreTab(sp.toString() ? `?${sp.toString()}` : '') ?? DEFAULT_MY_STORE_TAB;

  const writeUrl = useCallback((search: string) => {
    try {
      window.history.replaceState(window.history.state, '', `${MY_STORE_HUB_PATH}${search}`);
    } catch {
      /* non-fatal */
    }
  }, []);

  const select = useCallback(
    (tab: MyStoreTab) => {
      writeUrl(searchForTabSwitch(tab));
      window.scrollTo({ top: 0 });
    },
    [writeUrl],
  );

  // Links inside a tab that target /my-store (e.g. "المنتجات ← العروض",
  // `?tab=promotions&productId=…`) are applied in place: no RSC request.
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
        if (url.pathname.replace(/\/+$/, '') !== MY_STORE_HUB_PATH) return;
        e.preventDefault();
        e.stopPropagation();
        writeUrl(url.search);
        window.scrollTo({ top: 0 });
      } catch {
        /* unparsable link — let the browser handle it */
      }
    },
    [writeUrl],
  );

  return (
    <section aria-label="لوحة المتجر" className="w-full text-start">
      <div
        role="tablist"
        aria-label="أقسام لوحة المتجر"
        className="sticky top-0 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur"
      >
        {MY_STORE_TABS.map((tab) => {
          const { label, Icon } = TAB_META[tab];
          const selected = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`my-store-tab-${tab}`}
              aria-selected={selected}
              aria-controls={`my-store-panel-${tab}`}
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
        id={`my-store-panel-${active}`}
        aria-labelledby={`my-store-tab-${active}`}
        onClickCapture={onPanelClickCapture}
      >
        <TabBody tab={active} />
      </div>
    </section>
  );
}
