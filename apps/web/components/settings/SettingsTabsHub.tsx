'use client';

/**
 * SETTINGS-HUB-01 — one page for the whole account-settings surface.
 *
 * Tabs: الملف الشخصي · الأمان · الجلسات · الإشعارات · المستخدمون المحظورون.
 * (See lib/settingsHubTabs.ts for what is NOT a tab.)
 *
 * Same deliberate choices as components/stores/MyStoreTabsHub.tsx:
 *  - Tab bodies are loaded with next/dynamic, and their chunks are included
 *    in the route's offline warming manifest.
 *  - Tab switching uses history.replaceState, NOT router.push: no RSC
 *    request, so it works with no network. A local `active` state is kept in
 *    sync with useSearchParams() (URL stays the source of truth for deep
 *    links / back-forward).
 *  - Links inside the panel that point at /settings are handled in place
 *    (capture phase).
 *  - Switching tabs drops per-tab query params (section, …).
 */

import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Bell,
  FileEdit,
  Lock,
  Monitor,
  User,
  UserX,
} from 'lucide-react';
import { TabsHub } from '@/components/shared/hub/TabsHub';
import { ROUTES } from '@/lib/constants';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_HUB_PATH,
  SETTINGS_TABS,
  resolveSettingsTab,
  searchForTabSwitch,
  type SettingsTab,
} from '@/lib/settingsHubTabs';

const SettingsPanel = dynamic(
  () => import('@/components/settings/UnifiedProfileSettings').then((m) => m.UnifiedProfileSettings),
  { loading: () => <SuspenseFallback /> },
);
const SecuritySettingsForm = dynamic(
  () => import('@/components/profile/SecuritySettingsForm').then((m) => m.SecuritySettingsForm),
  { loading: () => <SuspenseFallback /> },
);
const DeleteAccountSection = dynamic(
  () => import('@/components/profile/DeleteAccountSection').then((m) => m.DeleteAccountSection),
  { loading: () => <SuspenseFallback /> },
);
const ActiveSessionsList = dynamic(
  () => import('@/components/profile/ActiveSessionsList').then((m) => m.ActiveSessionsList),
  { loading: () => <SuspenseFallback /> },
);
const NotificationSettingsForm = dynamic(
  () => import('@/components/profile/NotificationSettingsForm').then((m) => m.NotificationSettingsForm),
  { loading: () => <SuspenseFallback /> },
);
const BlockedUsersList = dynamic(
  () => import('@/components/profile/BlockedUsersList').then((m) => m.BlockedUsersList),
  { loading: () => <SuspenseFallback /> },
);
const ViewMyProfileLink = dynamic(
  () => import('@/components/profile/ViewMyProfileLink').then((m) => m.ViewMyProfileLink),
  { loading: () => <span className="h-8 w-24 animate-pulse rounded bg-muted" /> },
);

const TAB_META: Record<SettingsTab, { label: string; Icon: typeof User }> = {
  profile: { label: 'الملف الشخصي', Icon: User },
  security: { label: 'الأمان', Icon: Lock },
  sessions: { label: 'الجلسات', Icon: Monitor },
  notifications: { label: 'الإشعارات', Icon: Bell },
  'blocked-users': { label: 'المحظورون', Icon: UserX },
};

function TabBody({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case 'security':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-extrabold tracking-tight">إعدادات الأمان</h1>
          <SecuritySettingsForm />
          <DeleteAccountSection />
        </div>
      );
    case 'sessions':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-extrabold tracking-tight">الجلسات النشطة</h1>
          <ActiveSessionsList />
        </div>
      );
    case 'notifications':
      // PHASE-B: مصدر واحد — الجهاز + المحتوى + ساعات الهدوء داخل
      // NotificationSettingsForm (بدون تكرار PushNotificationToggle هنا).
      return (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">الإشعارات</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              جهازك، أنواع التنبيهات، ووقت الإرسال — كل ذلك في مكان واحد.
            </p>
          </div>
          <NotificationSettingsForm />
        </div>
      );
    case 'blocked-users':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-extrabold tracking-tight">المستخدمون المحظورون</h1>
          <BlockedUsersList />
        </div>
      );
    case 'profile':
    default:
      return (
        <div className="space-y-4">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <h1 className="text-xl font-extrabold tracking-tight">الملف الشخصي</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Link
                href={ROUTES.offline.drafts}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <FileEdit className="h-4 w-4" />
                مركز المسودات
              </Link>
              <ViewMyProfileLink />
            </div>
          </div>
          <SettingsPanel />
        </div>
      );
  }
}

export function SettingsTabsHub() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <TabsHub<SettingsTab>
      idPrefix="settings"
      sectionLabel="الإعدادات"
      tabListLabel="أقسام الإعدادات"
      hubPath={SETTINGS_HUB_PATH}
      tabs={SETTINGS_TABS}
      defaultTab={DEFAULT_SETTINGS_TAB}
      meta={TAB_META}
      resolveTab={resolveSettingsTab}
      searchForTabSwitch={searchForTabSwitch}
      renderTab={(tab) => <TabBody tab={tab} />}
      panelFallback={
        <div className="flex justify-center py-10 text-sm text-muted-foreground">
          جاري التحميل…
        </div>
      }
      />
    </div>
  );
}
