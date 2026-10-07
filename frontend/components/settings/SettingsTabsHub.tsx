'use client';

/**
 * SETTINGS-HUB-01 — one page for the whole account-settings surface.
 *
 * Tabs: الملف الشخصي · الأمان · الجلسات · الإشعارات · المستخدمون المحظورون.
 * (See lib/settingsHubTabs.ts for what is NOT a tab.)
 *
 * Same deliberate choices as components/stores/MyStoreTabsHub.tsx:
 *  - Tab bodies are STATICALLY imported, never next/dynamic (the warming
 *    engine caches only the chunks referenced by the route's HTML).
 *  - Tab switching uses history.replaceState, NOT router.push: no RSC
 *    request, so it works with no network. A local `active` state is kept in
 *    sync with useSearchParams() (URL stays the source of truth for deep
 *    links / back-forward).
 *  - Links inside the panel that point at /settings are handled in place
 *    (capture phase).
 *  - Switching tabs drops per-tab query params (section, …).
 */

import Link from 'next/link';
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
import { UnifiedProfileSettings } from '@/components/settings/UnifiedProfileSettings';
import { SecuritySettingsForm } from '@/components/profile/SecuritySettingsForm';
import { DeleteAccountSection } from '@/components/profile/DeleteAccountSection';
import { ActiveSessionsList } from '@/components/profile/ActiveSessionsList';
import { NotificationSettingsForm } from '@/components/profile/NotificationSettingsForm';
import { BlockedUsersList } from '@/components/profile/BlockedUsersList';
import { ViewMyProfileLink } from '@/components/profile/ViewMyProfileLink';
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_HUB_PATH,
  SETTINGS_TABS,
  resolveSettingsTab,
  searchForTabSwitch,
  type SettingsTab,
} from '@/lib/settingsHubTabs';

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
        <div className="space-y-6">
          <h1 className="text-xl font-bold">إعدادات الأمان</h1>
          <SecuritySettingsForm />
          <DeleteAccountSection />
        </div>
      );
    case 'sessions':
      return (
        <div className="space-y-6">
          <h1 className="text-xl font-bold">الجلسات النشطة</h1>
          <ActiveSessionsList />
        </div>
      );
    case 'notifications':
      // PHASE-B: مصدر واحد — الجهاز + المحتوى + ساعات الهدوء داخل
      // NotificationSettingsForm (بدون تكرار PushNotificationToggle هنا).
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold">الإشعارات</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              جهازك، أنواع التنبيهات، ووقت الإرسال — كل ذلك في مكان واحد.
            </p>
          </div>
          <NotificationSettingsForm />
        </div>
      );
    case 'blocked-users':
      return (
        <div className="space-y-6">
          <h1 className="text-xl font-bold">المستخدمون المحظورون</h1>
          <BlockedUsersList />
        </div>
      );
    case 'profile':
    default:
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold">الملف الشخصي</h1>
            <div className="flex items-center gap-3">
              <Link
                href={ROUTES.offline.drafts}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <FileEdit className="h-4 w-4" />
                مركز المسودات
              </Link>
              <ViewMyProfileLink />
            </div>
          </div>
          <UnifiedProfileSettings />
        </div>
      );
  }
}

export function SettingsTabsHub() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4 rounded-2xl border bg-card px-4 py-4 shadow-sm sm:px-5">
        <p className="text-xs font-medium text-primary">مساحة الحساب</p>
        <h1 className="mt-1 text-xl font-bold sm:text-2xl">الإعدادات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تحكم في ملفك، أمان حسابك، إشعاراتك والجلسات المفتوحة من مكان واحد.
        </p>
      </div>
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
