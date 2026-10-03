'use client';

/**
 * OFFLINE-HUB-01 — مركز الأوفلاين: one page for everything offline.
 *
 * Tabs: محفوظات · مسودات · مزامنة · مساحة · جاهزية (تسخين).
 *
 * Deliberate design choices:
 *  - Tab bodies are STATICALLY imported, never next/dynamic (SW warming).
 *  - Tab switching is client state + history.replaceState, NOT router.push.
 *  - Signed-out visitors only get GUEST_OFFLINE_TABS.
 *
 * UX phase 1+2:
 *  - Status Hero (اتصال + أعداد + CTA سياقي)
 *  - Badges على التبويبات
 *  - تسميات أوضح للمستخدم
 *  - تبويبات sticky بارتفاع لمس أفضل
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Download,
  FileText,
  RefreshCw,
  HardDrive,
  Flame,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, selectUser, selectIsHydrated } from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { usePendingDraftsCount } from '@/hooks/usePendingDraftsCount';
import { useQueuedRequestCount } from '@/hooks/useQueuedRequestCount';
import { getQueuedRequestCounts } from '@/lib/offlineQueue';
import { requestQueueReplay } from '@/lib/offlineQueue';
import {
  getWifiOnlySync,
  setWifiOnlySync,
  isOfflineHubOnboardingDismissed,
  dismissOfflineHubOnboarding,
  shouldAutoSyncNow,
  describeNetworkForSync,
} from '@/lib/offlineHubPrefs';
import {
  listOfflineActivity,
  logOfflineActivity,
  clearOfflineActivity,
  formatActivityTime,
  getActivityKindLabel,
  type OfflineActivityEntry,
} from '@/lib/offlineActivityLog';
import { Button } from '@/components/shared/ui/Button';
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

const TAB_META: Record<
  OfflineTab,
  { label: string; shortLabel: string; Icon: typeof Download }
> = {
  saved: { label: 'محفوظاتي', shortLabel: 'محفوظات', Icon: Download },
  drafts: { label: 'مسودات', shortLabel: 'مسودات', Icon: FileText },
  sync: { label: 'بانتظار الإرسال', shortLabel: 'مزامنة', Icon: RefreshCw },
  storage: { label: 'المساحة', shortLabel: 'مساحة', Icon: HardDrive },
  warming: { label: 'جاهزية بدون نت', shortLabel: 'جاهزية', Icon: Flame },
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
            <Intro title="إعلانات محفوظة على الجهاز">
              تفتح كاملة (صور وتفاصيل) حتى بدون إنترنت. احفظ أي إعلان من صفحته بزر الحفظ.
            </Intro>
            <SavedOfflineAdsPageClient />
          </section>
          <section>
            <Intro title="تنزيلات الكتالوجات">
              كتالوجات متاجر حمّلتها للتصفح دون اتصال. أعد التحميل من صفحة المتجر عند الحاجة.
            </Intro>
            <DownloadsPageClient />
          </section>
        </div>
      );
    case 'drafts':
      return (
        <section>
          <Intro title="مسوداتك على هذا الجهاز">
            كل ما بدأته ولم يُنشر بعد — يبقى هنا ويعمل بدون نت. أكملها ثم أرسلها عند الاتصال.
          </Intro>
          <DraftsCenterClient />
        </section>
      );
    case 'sync':
      return <SyncCenterClient />;
    case 'storage':
      return (
        <section>
          <Intro title="مساحة التخزين">
            راقب ما يستهلكه التطبيق على جهازك. يمكنك تحرير مساحة دون حذف محفوظاتك اليدوية إن
            اخترت ذلك.
          </Intro>
          <StorageManagementClient />
        </section>
      );
    case 'warming':
    default:
      return (
        <section>
          <Intro title="جاهزية التطبيق بدون نت">
            اختر مستوى التجهيز مسبقاً حتى تفتح الصفحات الأساسية عند انقطاع الاتصال. المحفوظات
            والتنزيلات اليدوية لا تُمس بهذه الإعدادات.
          </Intro>
          <OfflineControlClient />
        </section>
      );
  }
}


function OnboardingTip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="mb-4 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4"
      role="note"
    >
      <p className="text-sm font-semibold">مرحباً في مركز الأوفلاين</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-relaxed text-muted-foreground">
        <li>احفظ إعلاناتاً لفتحها بدون نت من «محفوظاتي».</li>
        <li>المسودات وما لم يُرسل يظهر في «مسودات» و«بانتظار الإرسال».</li>
        <li>من «جاهزية بدون نت» جهّز الصفحات مسبقاً حسب استهلاك بياناتك.</li>
      </ul>
      <Button type="button" size="sm" className="mt-3 min-h-10" onClick={onDismiss}>
        حسناً، فهمت
      </Button>
    </div>
  );
}

function WifiOnlyToggle({
  enabled,
  onChange,
  networkLabel,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  networkLabel: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">مزامنة تلقائية على Wi‑Fi فقط</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          عند التفعيل لن يُرسل المعلّق تلقائياً على بيانات الجوال. شبكتك الآن:{' '}
          <span className="font-medium text-foreground">{networkLabel}</span>
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          enabled ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-all',
            enabled ? 'inset-inline-start-5' : 'inset-inline-start-0.5',
          )}
        />
        <span className="sr-only">مزامنة على Wi‑Fi فقط</span>
      </button>
    </div>
  );
}

function ActivityPanel({
  items,
  onClear,
}: {
  items: OfflineActivityEntry[];
  onClear: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-border/70 bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">آخر النشاط</p>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onClear}>
          مسح السجل
        </Button>
      </div>
      <ul className="space-y-2">
        {items.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-2 text-xs">
            <div className="min-w-0">
              <span className="font-medium text-foreground">{getActivityKindLabel(e.kind)}</span>
              <span className="text-muted-foreground"> — {e.message}</span>
            </div>
            <time className="shrink-0 tabular-nums text-muted-foreground" dateTime={new Date(e.at).toISOString()}>
              {formatActivityTime(e.at)}
            </time>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusHero({
  isOnline,
  pendingQueue,
  failedQueue,
  draftsCount,
  isSignedIn,
  onGoSync,
  onGoDrafts,
  onRetryAll,
  retrying,
}: {
  isOnline: boolean;
  pendingQueue: number;
  failedQueue: number;
  draftsCount: number;
  isSignedIn: boolean;
  onGoSync: () => void;
  onGoDrafts: () => void;
  onRetryAll: () => void;
  retrying: boolean;
}) {
  const needsAttention = failedQueue > 0 || pendingQueue > 0 || draftsCount > 0;

  let headline: string;
  let detail: string;
  if (!isOnline) {
    headline = 'أنت غير متصل حالياً';
    detail = needsAttention
      ? 'ما حفظته أو أعددته للإرسال سيُحاول عند عودة الإنترنت.'
      : 'يمكنك تصفح المحفوظات والصفحات المُجهَّزة مسبقاً.';
  } else if (failedQueue > 0) {
    headline = `${failedQueue} عملية تحتاج انتباهك`;
    detail = 'بعض الإرسالات فشلت. يمكنك إعادة المحاولة أو تعديل المسودة.';
  } else if (pendingQueue > 0) {
    headline = `${pendingQueue} بانتظار الإرسال`;
    detail = 'الاتصال متاح — يمكنك إرسال المعلّق الآن.';
  } else if (draftsCount > 0) {
    headline = `${draftsCount} مسودة غير مكتملة`;
    detail = 'أكمل المسودات من تبويب المسودات ثم انشرها.';
  } else {
    headline = 'كل شيء مُزامَن';
    detail = isSignedIn
      ? 'لا يوجد طابور معلّق. المحفوظات والمسودات تحت السيطرة.'
      : 'تصفح المحفوظات أو جهّز التطبيق للعمل بدون نت.';
  }

  return (
    <div
      className={cn(
        'mb-4 rounded-2xl border p-4 shadow-xs',
        !isOnline && 'border-warning/35 bg-warning/[0.06]',
        isOnline && failedQueue > 0 && 'border-destructive/30 bg-destructive/[0.04]',
        isOnline && failedQueue === 0 && pendingQueue > 0 && 'border-primary/25 bg-primary/[0.05]',
        isOnline && failedQueue === 0 && pendingQueue === 0 && 'border-border/70 bg-card',
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {isOnline ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-2xs font-semibold text-success dark:text-success">
                <Wifi className="h-3.5 w-3.5" aria-hidden />
                متصل
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-2xs font-semibold text-warning-strong dark:text-warning">
                <WifiOff className="h-3.5 w-3.5" aria-hidden />
                بدون نت
              </span>
            )}
            {isOnline && failedQueue === 0 && pendingQueue === 0 && draftsCount === 0 && (
              <CheckCircle2 className="h-4 w-4 text-success dark:text-success" aria-hidden />
            )}
            {failedQueue > 0 && (
              <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
            )}
          </div>
          <p className="text-base font-semibold tracking-tight">{headline}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{detail}</p>

          {isSignedIn && (pendingQueue > 0 || failedQueue > 0 || draftsCount > 0) && (
            <ul className="mt-2 flex flex-wrap gap-2 text-2xs text-muted-foreground sm:text-xs">
              {pendingQueue > 0 && (
                <li className="rounded-md bg-muted/80 px-2 py-1">معلّق: {pendingQueue}</li>
              )}
              {failedQueue > 0 && (
                <li className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">
                  فشل: {failedQueue}
                </li>
              )}
              {draftsCount > 0 && (
                <li className="rounded-md bg-muted/80 px-2 py-1">مسودات: {draftsCount}</li>
              )}
            </ul>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[10rem]">
          {isOnline && (pendingQueue > 0 || failedQueue > 0) && (
            <Button
              className="min-h-11 w-full"
              onClick={onRetryAll}
              disabled={retrying}
            >
              {retrying ? 'جاري الإرسال…' : 'إرسال المعلّق الآن'}
            </Button>
          )}
          {isOnline && failedQueue > 0 && (
            <Button variant="outline" className="min-h-11 w-full" onClick={onGoSync}>
              عرض التفاصيل
            </Button>
          )}
          {!isOnline && (pendingQueue > 0 || failedQueue > 0) && (
            <Button variant="outline" className="min-h-11 w-full" onClick={onGoSync}>
              عرض قائمة الانتظار
            </Button>
          )}
          {isOnline && failedQueue === 0 && pendingQueue === 0 && draftsCount > 0 && (
            <Button className="min-h-11 w-full" onClick={onGoDrafts}>
              فتح المسودات
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBadge({ count, tone = 'default' }: { count: number; tone?: 'default' | 'danger' }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'ms-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-2xs font-bold tabular-nums',
        tone === 'danger'
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-primary-foreground/20 text-primary-foreground',
        tone === 'default' && 'group-data-[selected=false]:bg-primary/15 group-data-[selected=false]:text-primary',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function OfflineHub({ initialTab }: { initialTab: OfflineTab | null }) {
  const user = useAuthStore(selectUser);
  const isHydrated = useAuthStore(selectIsHydrated);
  const isSignedIn = user != null;
  const isOnline = useOnlineStatus();
  const draftsCount = usePendingDraftsCount(user?.id);
  const pendingQueue = useQueuedRequestCount();
  const [failedQueue, setFailedQueue] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activity, setActivity] = useState<OfflineActivityEntry[]>([]);
  const [networkLabel, setNetworkLabel] = useState('—');

  const [requested, setRequested] = useState<OfflineTab>(initialTab ?? DEFAULT_OFFLINE_TAB);

  useEffect(() => {
    if (initialTab) setRequested(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setWifiOnly(getWifiOnlySync());
    setShowOnboarding(!isOfflineHubOnboardingDismissed());
    setActivity(listOfflineActivity(8));
    setNetworkLabel(describeNetworkForSync());
    logOfflineActivity('hub_open', 'تم فتح مركز الأوفلاين');
    // analytics soft (optional)
    function onPrefs() {
      setWifiOnly(getWifiOnlySync());
      setShowOnboarding(!isOfflineHubOnboardingDismissed());
      setNetworkLabel(describeNetworkForSync());
    }
    function onActivity() {
      setActivity(listOfflineActivity(8));
    }
    window.addEventListener('offline-hub:prefs-changed', onPrefs);
    window.addEventListener('offline-hub:activity', onActivity);
    window.addEventListener('online', onPrefs);
    window.addEventListener('offline', onPrefs);
    return () => {
      window.removeEventListener('offline-hub:prefs-changed', onPrefs);
      window.removeEventListener('offline-hub:activity', onActivity);
      window.removeEventListener('online', onPrefs);
      window.removeEventListener('offline', onPrefs);
    };
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    function refreshFailed() {
      getQueuedRequestCounts()
        .then((c) => {
          if (!cancelled) setFailedQueue(c.failed);
        })
        .catch(() => undefined);
    }
    refreshFailed();
    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === 'QUEUE_REPLAYED') refreshFailed();
    }
    window.addEventListener('offline-queue:queued', refreshFailed);
    window.addEventListener('online', refreshFailed);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      cancelled = true;
      window.removeEventListener('offline-queue:queued', refreshFailed);
      window.removeEventListener('online', refreshFailed);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, []);

  const tabs = visibleOfflineTabs(isSignedIn);
  const active: OfflineTab =
    tabs.includes(requested) || !isHydrated ? requested : DEFAULT_OFFLINE_TAB;

  const select = useCallback((tab: OfflineTab) => {
    setRequested(tab);
    try {
      const url = new URL(window.location.href);
      url.pathname = '/offline';
      url.searchParams.set('tab', tab);
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    function onPop() {
      const t = resolveOfflineTab(window.location.search, window.location.pathname);
      if (t) setRequested(t);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
        /* ignore */
      }
    },
    [select],
  );

  async function onRetryAll() {
    setRetrying(true);
    try {
      logOfflineActivity('queue_retry', 'طلب إعادة إرسال المعلّق يدوياً');
      await requestQueueReplay();
      logOfflineActivity('sync_ok', 'اكتملت محاولة إعادة الإرسال');
    } catch {
      logOfflineActivity('sync_fail', 'فشلت إعادة الإرسال');
    } finally {
      setRetrying(false);
      getQueuedRequestCounts()
        .then((c) => setFailedQueue(c.failed))
        .catch(() => undefined);
      setActivity(listOfflineActivity(8));
    }
  }

  return (
    <section aria-label="مركز الأوفلاين" className="w-full text-start" dir="rtl">
      <header className="mb-3">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">مركز الأوفلاين</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          محفوظاتك، مسوداتك، وما ينتظر الإرسال — في مكان واحد.
        </p>
      </header>

      {showOnboarding && (
        <OnboardingTip
          onDismiss={() => {
            dismissOfflineHubOnboarding();
            setShowOnboarding(false);
          }}
        />
      )}

      {isSignedIn && (
        <WifiOnlyToggle
          enabled={wifiOnly}
          networkLabel={networkLabel}
          onChange={(v) => {
            setWifiOnlySync(v);
            setWifiOnly(v);
            if (v && !shouldAutoSyncNow()) {
              logOfflineActivity(
                'sync_skipped_wifi',
                'المزامنة التلقائية مؤجلة حتى Wi‑Fi (الإعداد مفعّل)',
              );
              setActivity(listOfflineActivity(8));
            }
          }}
        />
      )}

      <StatusHero
        isOnline={isOnline}
        pendingQueue={isSignedIn ? pendingQueue : 0}
        failedQueue={isSignedIn ? failedQueue : 0}
        draftsCount={isSignedIn ? draftsCount : 0}
        isSignedIn={isSignedIn}
        onGoSync={() => select('sync')}
        onGoDrafts={() => select('drafts')}
        onRetryAll={() => void onRetryAll()}
        retrying={retrying}
      />

      <ActivityPanel
        items={activity}
        onClear={() => {
          clearOfflineActivity();
          setActivity([]);
        }}
      />

      <div
        role="tablist"
        aria-label="أقسام مركز الأوفلاين"
        className={cn(
          'sticky top-0 z-10 -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 py-2',
          'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90',
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {tabs.map((tab) => {
          const { label, shortLabel, Icon } = TAB_META[tab];
          const selected = tab === active;
          const badge =
            tab === 'drafts'
              ? draftsCount
              : tab === 'sync'
                ? pendingQueue + failedQueue
                : 0;
          const badgeTone = tab === 'sync' && failedQueue > 0 ? 'danger' : 'default';
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`offline-tab-${tab}`}
              aria-selected={selected}
              aria-controls={`offline-panel-${tab}`}
              data-selected={selected}
              onClick={() => select(tab)}
              className={cn(
                'group flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border/80 bg-card text-muted-foreground hover:border-primary/35 hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden={true} />
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
              {isSignedIn && (
                <TabBadge count={badge} tone={selected && badgeTone === 'danger' ? 'danger' : badgeTone} />
              )}
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
