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

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Bell,
  FileEdit,
  Lock,
  Monitor,
  User,
  UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import { UnifiedProfileSettings } from '@/components/settings/UnifiedProfileSettings';
import { SecuritySettingsForm } from '@/components/profile/SecuritySettingsForm';
import { DeleteAccountSection } from '@/components/profile/DeleteAccountSection';
import { ActiveSessionsList } from '@/components/profile/ActiveSessionsList';
import { NotificationSettingsForm } from '@/components/profile/NotificationSettingsForm';
import { PushNotificationToggle } from '@/components/pwa/PushNotificationToggle';
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
      return (
        <div className="space-y-8">
          <div>
            <h1 className="text-xl font-bold">إدارة أذونات الإشعارات</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              تحكم بإذن الجهاز وأنواع التنبيهات التي تريد استلامها.
            </p>
          </div>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">1 · إذن هذا الجهاز</h2>
            <PushNotificationToggle />
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">2 · ماذا يصلك؟</h2>
            <NotificationSettingsForm />
          </section>
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
                href={ROUTES.settings.drafts}
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
  const sp = useSearchParams();
  const urlTab: SettingsTab =
    resolveSettingsTab(sp.toString() ? `?${sp.toString()}` : '') ?? DEFAULT_SETTINGS_TAB;

  // Next.js does not reliably re-render on history.replaceState, so keep a
  // local tab state alongside the URL (same fix as MY-STORE-TAB-STATE-FIX-01).
  const [active, setActive] = useState<SettingsTab>(urlTab);

  useEffect(() => {
    setActive(urlTab);
  }, [urlTab]);

  const writeUrl = useCallback((search: string) => {
    try {
      window.history.replaceState(window.history.state, '', `${SETTINGS_HUB_PATH}${search}`);
    } catch {
      /* non-fatal */
    }
  }, []);

  const select = useCallback(
    (tab: SettingsTab) => {
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
        if (url.pathname.replace(/\/+$/, '') !== SETTINGS_HUB_PATH) return;
        e.preventDefault();
        e.stopPropagation();
        writeUrl(url.search);
        setActive(resolveSettingsTab(url.search) ?? DEFAULT_SETTINGS_TAB);
        window.scrollTo({ top: 0 });
      } catch {
        /* unparsable link — let the browser handle it */
      }
    },
    [writeUrl],
  );

  return (
    <section aria-label="الإعدادات" className="w-full text-start">
      <div
        role="tablist"
        aria-label="أقسام الإعدادات"
        className="sticky top-0 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur"
      >
        {SETTINGS_TABS.map((tab) => {
          const { label, Icon } = TAB_META[tab];
          const selected = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`settings-tab-${tab}`}
              aria-selected={selected}
              aria-controls={`settings-panel-${tab}`}
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
        id={`settings-panel-${active}`}
        aria-labelledby={`settings-tab-${active}`}
        onClickCapture={onPanelClickCapture}
      >
        <Suspense
          fallback={
            <div className="flex justify-center py-10 text-sm text-muted-foreground">
              جاري التحميل…
            </div>
          }
        >
          <TabBody tab={active} />
        </Suspense>
      </div>
    </section>
  );
}
