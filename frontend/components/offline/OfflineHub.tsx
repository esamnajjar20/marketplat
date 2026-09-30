'use client';

/**
 * OFFLINE-HUB-01 — مركز الأوفلاين: one page for everything offline.
 *
 * Tabs: محفوظات (saved ads + downloads) · مسودات · مزامنة · تخزين · تسخين.
 *
 * Deliberate design choices (see PROD notes in the change summary):
 *  - Tab bodies are STATICALLY imported, never next/dynamic. The warming
 *    engine caches only the chunks referenced by the route's HTML
 *    (`<script src=/_next/static/…>`); lazy chunks are invisible to it, so a
 *    lazy tab would be blank the first time it is opened offline — the exact
 *    failure this hub exists to prevent.
 *  - Tab switching is client state + history.replaceState, NOT router.push:
 *    no RSC request, so switching works with no network at all.
 *  - Signed-out visitors only get tabs that need no account (see
 *    GUEST_OFFLINE_TABS); the rest appear once the persisted session is known.
 */

import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, RefreshCw, HardDrive, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, selectUser, selectIsHydrated } from '@/store/auth.store';
import { SavedOfflineAdsPageClient } from '@/components/ads/SavedOfflineAdsPageClient';
import { DownloadsPageClient } from '@/components/downloads/DownloadsPageClient';
import { DraftsCenterClient } from '@/components/settings/DraftsCenterClient';
import { SyncCenterClient } from '@/components/settings/SyncCenterClient';
import { StorageManagementClient } from '@/components/settings/StorageManagementClient';
import { OfflineControlClient } from '@/components/settings/OfflineControlClient';
import {
  DEFAULT_OFFLINE_TAB,
  resolveOfflineTab,
  visibleOfflineTabs,
  type OfflineTab,
} from '@/lib/offlineHubTabs';

const TAB_META: Record<OfflineTab, { label: string; Icon: typeof Download }> = {
  saved: { label: 'محفوظات', Icon: Download },
  drafts: { label: 'مسودات', Icon: FileText },
  sync: { label: 'مزامنة', Icon: RefreshCw },
  storage: { label: 'تخزين', Icon: HardDrive },
  warming: { label: 'تسخين', Icon: Flame },
};

function Intro({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function TabBody({ tab }: { tab: OfflineTab }) {
  switch (tab) {
    case 'saved':
      return (
        <div className="space-y-8">
          <section>
            <Intro title="الإعلانات المحفوظة دون اتصال">
              الإعلانات التي حفظتها صراحة على هذا الجهاز — تفتح كاملة (الصور والتفاصيل) حتى بدون
              إنترنت.
            </Intro>
            <SavedOfflineAdsPageClient />
          </section>
          <section>
            <Intro title="التنزيلات">
              سجل كتالوجات المتاجر التي حمّلتها للعرض دون اتصال. أعد التحميل من صفحة المتجر عند
              الحاجة.
            </Intro>
            <DownloadsPageClient />
          </section>
        </div>
      );
    case 'drafts':
      return (
        <section>
          <Intro title="مركز المسودات">
            كل ما بدأته ولم يُنشر بعد — محفوظ على جهازك ويعمل بدون إنترنت.
          </Intro>
          <DraftsCenterClient />
        </section>
      );
    case 'sync':
      // SyncCenterClient renders its own heading.
      return <SyncCenterClient />;
    case 'storage':
      return (
        <section>
          <Intro title="التخزين والبيانات">
            راقب المساحة على جهازك، أدِر الكاش والتنزيلات والمسودات، وفعّل توفير البيانات للعمل
            بسلاسة حتى مع اتصال ضعيف.
          </Intro>
          <StorageManagementClient />
        </section>
      );
    case 'warming':
    default:
      return (
        <section>
          <Intro title="العمل بدون إنترنت">
            تحكّم في استهلاك البيانات والمساحة المستخدمة لتحضير التطبيق للعمل عند انقطاع الاتصال.
            التنزيلات اليدوية والإعلانات المحفوظة لا تتأثر بهذه الإعدادات.
          </Intro>
          <OfflineControlClient />
        </section>
      );
  }
}

export function OfflineHub({ initialTab }: { initialTab: OfflineTab | null }) {
  const user = useAuthStore(selectUser);
  const isHydrated = useAuthStore(selectIsHydrated);
  const isSignedIn = user != null;

  const [requested, setRequested] = useState<OfflineTab>(initialTab ?? DEFAULT_OFFLINE_TAB);

  // The URL is only readable after mount (page computes initialTab in an effect).
  useEffect(() => {
    if (initialTab) setRequested(initialTab);
  }, [initialTab]);

  const tabs = visibleOfflineTabs(isSignedIn);
  // Don't demote a requested account tab to 'saved' until the persisted
  // session has been read — otherwise /offline?tab=sync flashes the wrong tab.
  const active: OfflineTab =
    tabs.includes(requested) || !isHydrated ? requested : DEFAULT_OFFLINE_TAB;

  const select = useCallback((tab: OfflineTab) => {
    setRequested(tab);
    try {
      const url = new URL(window.location.href);
      url.pathname = '/offline';
      url.searchParams.set('tab', tab);
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    } catch {
      /* non-fatal: tab still switches */
    }
  }, []);

  // Back/forward between tabs we wrote with replaceState/pushState by others.
  useEffect(() => {
    const onPop = () => {
      const t = resolveOfflineTab(window.location.search, window.location.pathname);
      if (t) setRequested(t);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Tab bodies contain <Link href="/offline?tab=…"> (e.g. Sync → Storage).
  // Letting the router handle them would be a same-route navigation that never
  // updates our state (and would need a network round trip). Handle in place.
  const onPanelClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as HTMLElement).closest?.('a');
      if (!a) return;
      try {
        const url = new URL(a.href, window.location.href);
        if (url.origin !== window.location.origin || url.pathname !== '/offline') return;
        const t = resolveOfflineTab(url.search, url.pathname);
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        select(t);
        window.scrollTo({ top: 0 });
      } catch {
        /* not a parsable link — let the browser handle it */
      }
    },
    [select],
  );

  return (
    <section aria-label="مركز الأوفلاين" className="w-full text-start">
      <div
        role="tablist"
        aria-label="أقسام مركز الأوفلاين"
        className="sticky top-0 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur"
      >
        {tabs.map((tab) => {
          const { label, Icon } = TAB_META[tab];
          const selected = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`offline-tab-${tab}`}
              aria-selected={selected}
              aria-controls={`offline-panel-${tab}`}
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
        id={`offline-panel-${active}`}
        aria-labelledby={`offline-tab-${active}`}
        onClickCapture={onPanelClickCapture}
      >
        <TabBody tab={active} />
      </div>
    </section>
  );
}
