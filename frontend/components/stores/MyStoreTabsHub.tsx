'use client';

/**
 * MY-STORE-HUB-01 — one page for the whole store-management surface.
 *
 * Tabs: نظرة عامة · المنتجات · المجموعات · العروض · المخزون · الفريق ·
 * الإحصائيات · الإعدادات. (See lib/myStoreHubTabs.ts for what is NOT a tab.)
 *
 * Shell (tab bar, replaceState switching, in-place links) lives in
 * components/shared/hub/TabsHub.tsx. Deliberate choices, as in OfflineHub:
 *  - Tab bodies are loaded with next/dynamic, and their chunks are included
 *    in the route's offline warming manifest.
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

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
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
import { TabsHub } from '@/components/shared/hub/TabsHub';
import { ROUTES } from '@/lib/constants';
import { useMyStore } from '@/hooks/queries/useStores';
import { getStoreTypeLabels } from '@/types/store.types';
import { Button } from '@/components/shared/ui/Button';
import {
  DEFAULT_MY_STORE_TAB,
  MY_STORE_HUB_PATH,
  MY_STORE_TABS,
  resolveMyStoreTab,
  searchForTabSwitch,
  type MyStoreTab,
} from '@/lib/myStoreHubTabs';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';

const MyStoreHub = dynamic(
  () => import('@/components/stores/MyStoreHub').then((m) => m.MyStoreHub),
  { loading: () => <SuspenseFallback /> },
);
const MyProductsList = dynamic(
  () => import('@/components/stores/MyProductsList').then((m) => m.MyProductsList),
  { loading: () => <SuspenseFallback /> },
);
const MyCollectionsList = dynamic(
  () => import('@/components/stores/MyCollectionsList').then((m) => m.MyCollectionsList),
  { loading: () => <SuspenseFallback /> },
);
const MyPromotionsList = dynamic(
  () => import('@/components/stores/MyPromotionsList').then((m) => m.MyPromotionsList),
  { loading: () => <SuspenseFallback /> },
);
const MyStoreInventory = dynamic(
  () => import('@/components/stores/MyStoreInventory').then((m) => m.MyStoreInventory),
  { loading: () => <SuspenseFallback /> },
);
const MyStoreMembersList = dynamic(
  () => import('@/components/stores/MyStoreMembersList').then((m) => m.MyStoreMembersList),
  { loading: () => <SuspenseFallback /> },
);
const MyMemberInvites = dynamic(
  () => import('@/components/stores/MyMemberInvites').then((m) => m.MyMemberInvites),
  { loading: () => <SuspenseFallback /> },
);
const MyStoreAnalytics = dynamic(
  () => import('@/components/stores/MyStoreAnalytics').then((m) => m.MyStoreAnalytics),
  { loading: () => <SuspenseFallback /> },
);
const StoreSettingsSection = dynamic(
  () => import('@/components/stores/StoreSettingsSection').then((m) => m.StoreSettingsSection),
  { loading: () => <SuspenseFallback /> },
);

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
      <h1 className="text-xl font-extrabold">{title}</h1>
      {children ? <p className="text-sm text-muted-foreground">{children}</p> : null}
    </div>
  );
}

function TabBody({ tab, storeLabels }: { tab: MyStoreTab; storeLabels: ReturnType<typeof getStoreTypeLabels> }) {
  switch (tab) {
    case 'products':
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-extrabold">{storeLabels.products}</h1>
            <Link prefetch={false} href={ROUTES.myStoreProductCreate}>
              <Button size="sm" className="gap-1.5">
                <PackagePlus className="h-4 w-4" />
                {storeLabels.addProduct}
              </Button>
            </Link>
          </div>
          <Suspense fallback={<SuspenseFallback />}>
            <MyProductsList />
          </Suspense>
        </div>
      );
    case 'collections':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-extrabold">مجموعات المتجر</h1>
          <Suspense fallback={<SuspenseFallback />}>
            <MyCollectionsList />
          </Suspense>
        </div>
      );
    case 'promotions':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-extrabold">العروض</h1>
          <Suspense fallback={<SuspenseFallback />}>
            <MyPromotionsList />
          </Suspense>
        </div>
      );
    case 'inventory':
      return (
        <Suspense fallback={<SuspenseFallback />}>
          <MyStoreInventory />
        </Suspense>
      );
    case 'members':
      return (
        <div className="space-y-6">
          <PageTitle title="فريق المتجر">
            أضف مديرين أو محرري منتجات وحدد صلاحيات كل شخص
          </PageTitle>
          <Suspense fallback={<SuspenseFallback />}>
            <MyMemberInvites />
          </Suspense>
          <Suspense fallback={<SuspenseFallback />}>
            <MyStoreMembersList />
          </Suspense>
        </div>
      );
    case 'analytics':
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-extrabold">إحصائيات المتجر</h1>
            <Button size="sm" asChild className="gap-1.5 font-semibold">
              <Link prefetch={false} href={ROUTES.myStoreProductCreate}>
                <PackagePlus className="h-4 w-4" />
                {storeLabels.addProduct}
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
          <Suspense fallback={<SuspenseFallback />}>
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
  const { data: store } = useMyStore();
  const storeLabels = getStoreTypeLabels(store?.storeType);

  return (
    <TabsHub<MyStoreTab>
      idPrefix="my-store"
      sectionLabel="لوحة المتجر"
      tabListLabel="أقسام لوحة المتجر"
      hubPath={MY_STORE_HUB_PATH}
      tabs={MY_STORE_TABS}
      defaultTab={DEFAULT_MY_STORE_TAB}
      meta={TAB_META}
      resolveTab={resolveMyStoreTab}
      searchForTabSwitch={searchForTabSwitch}
      renderTab={(tab) => <TabBody tab={tab} storeLabels={storeLabels} />}
    />
  );
}
